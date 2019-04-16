import { store, fetchMethodWithTimeout, MultiRestError, createNotification } from '../app.js';

let schema = {
  uri: 'http://openhab.org/schema/items-schema.json', // id of the item schema
  fileMatch: ["http://openhab.org/schema/items-schema.json"], // associate with our model
  schema: {
    type: 'array',
    items: { "$ref": "#/definitions/item" },
    definitions: {
      item: {
        type: "object",
        description: "An openHAB item",
        required: ["type", "name", "label"],
        properties: {
          link: { type: "string", description: "Internal URI information for openHAB REST clients" },
          type: {
            type: "string",
            enum: ['String', 'Number', 'Switch', 'Color', 'Contact', 'DateTime', 'Dimmer', 'Image', 'Location', 'Player',
              'Rollershutter', 'Group'],
            description: "The item type"
          },
          category: {
            type: "string",
            description: "The item icon",
            enum: []
          },
          editable: { type: "boolean", description: "Items defined via old .item files are not editable" },
          state: {
            type: ["integer", "string", "boolean"],
            description: "The current state of the item",
          },
          stateDescription: {
            type: "object",
            description: "The state can be limited to a number of options and formatted",
            required: ["pattern", "readOnly", "options"],
            properties: {
              pattern: { type: "string", description: "A formatter pattern" },
              readOnly: { type: "boolean", description: "Is this state read-only?" },
              options: { type: "array", description: "Options" },
            }
          },
          metadata: {
            type: "object",
            description: "An item can have metadata. Metadata is organized in namespaces",
            properties: {}
          },
          function: {
            type: "object",
            description: "A group item can have a function assigned to compute an overall state for all items",
            required: ["name"],
            properties: {
              name: { type: "string", description: "The function name" },
              params: { type: "array", description: "Parameters for the function" },
            }
          },
          name: { type: "string", description: "A unique ID for this item", minLength: 2 },
          label: { type: "string", description: "A friendly name", minLength: 2 },
          tags: {
            type: "array", "uniqueItems": true, description: "Tags of this item",
            items: {
              "type": "string"
            }
          },
          groupNames: {
            type: "array", "uniqueItems": true, description: "Assign this item to groups",
            items: {
              "type": "string",
              "enum": []
            }
          },
        }
      }
    }
  },
};

class ModelAdapter {
  constructor() {
    this.STORE_ITEM_INDEX_PROP = Object.freeze("name");
    this.runtimeKeys = ["link", "editable", "state"]; this.items = [];
  }
  stores() { return { "items": "items" } };
  sortStore() { return "items" };
  getall(options = null) {
    return store.get("item-types", null, { force: true })
      .then(json => this.itemtypes = json)
      .then(() => store.get("item-group-function-types", null, { force: true }))
      .then(v => this.functiontypes = v)
      .then(() => store.get("config-descriptions", null, { filter: "uri:metadata", force: true }))
      .then(v => this.config = v)
      .then(() => store.get("icon-set", null, { force: true }))
      .then(v => this.iconset = v)
      .then(() => store.get("semantic-tags", null, { force: true }))
      .then(v => {
        let semantic = {};
        // Create a map from type->entry
        for (let semanticTag of v) {
          // Create another inner map from tag->entry
          if (!semantic[semanticTag.type])
            semantic[semanticTag.type] = new Map;
          semantic[semanticTag.type].set(semanticTag.tag, semanticTag);
        }
        this.semantic = semantic;
      })
      .then(() => this.get(null, null, options))
  }
  async get(table = null, objectid = null, options = null) {
    this.items = await store.get("items", null, options);
    this.adaptSchema();
  }
  dispose() {
  }
  adaptSchema() {
    // Add all known metadata namespaces and their properties to the json schema
    let metadata = schema.schema.definitions.item.properties.metadata;
    metadata.properties = {};
    for (let config of this.config) {
      const namespace = config.uri.split("metadata:")[1];
      metadata.properties[namespace] = { type: "object", description: "The metadata namespace " + namespace, properties: {} };
      for (let param of config.parameters) {
        metadata.properties[namespace].properties[param.name] = {};
        let o = metadata.properties[namespace].properties[param.name];
        o.description = param.description || param.name;
        switch (param.type) {
          case "BOOLEAN":
            o.type = "boolean";
            break;
          case "DECIMAL":
          case "INTEGER":
            o.type = "number";
            break;
          default:
            o.type = "string";
        }
        if (param.options && param.options.length && param.limitToOptions) {
          o.enum = param.options.map(e => e.value);
        }
      }
    }

    // Add all allowed function types to the schema
    let functiontypes = schema.schema.definitions.item.properties.function;
    functiontypes.properties.name.enum = this.functiontypes.map(e => e.id);

    // Add all possible group items to the schema
    schema.schema.definitions.item.properties.groupNames.items.enum = this.items.filter(i => i.type === "Group").map(i => i.name);

    // Add icon set options
    schema.schema.definitions.item.properties.category.enum = this.iconset;
    schema.schema.definitions.item.properties.category.enum.push("");
  }
  getAllowedStates(itemtype) {
    for (let t of this.itemtypes) {
      if (t.id == itemtype) {
        return t.allowedStates;
      }
    }
    return [];
  }
  getCommands(itemtype) {
    for (let t of this.itemtypes) {
      if (t.id == itemtype) {
        return t.commands || [];
      }
    }
    return [];
  }
}

const ItemsMixin = {
  computed: {
    isGroup: function () {
      return this.item.type == "Group";
    },
    iconpath: function () {
      if (store.host != "demo" && this.item.category) {
        return store.host + "/icon/" + this.item.category;
      } else {
        return "./img/scene_dummy.jpg";
      }
      return null;
    },
    itemcommands() {
      let commands = this.$list.store.getCommands(this.item.groupType ? this.item.groupType : this.item.type);
      if (commands.length)
        return commands.join(",");
      return "";
    },
    groupfunctions() {
      return this.$list.store.functiontypes.filter(e => e.compatible.length == 0 || e.compatible.includes(this.item.groupType));
    },
    hasFunctionParameters() {
      if (!this.item.function || !this.item.function.name) return false;
      let fun = this.$list.store.functiontypes.find(e => e.id == this.item.function.name);
      return (fun && fun.params);
    },
    functionparameters() {
      let fun = this.$list.store.functiontypes.find(e => e.id == this.item.function.name);
      if (!fun || !fun.params) return [];
      const params = [];
      for (let i = 0; i < fun.params.length; ++i) {
        let param = fun.params[i];
        const value = (this.item.function.params && this.item.function.params.length > i) ? this.item.function.params[i] : null;
        let allowedStates = this.$list.store.getAllowedStates(this.item.groupType);
        if (allowedStates.length) allowedStates = allowedStates.join(",");
        params.push(Object.assign({ value, allowedStates }, param));
      }
      return params;
    },
    namespaces: function () {
      let result = [];
      const configs = this.$list.store.config || [];
      const metadata = this.item.metadata || {};

      for (let config of configs) {
        if (!config.uri.startsWith("metadata:") || !config.parameters) continue;
        const namespace = config.uri.split("metadata:")[1];
        const data = metadata[namespace] || {};
        result.push({ name: namespace, values: Object.assign({}, data), parameters: config.parameters, hasconfig: true });
      }

      let namespaces = Object.keys(metadata);
      for (const namespaceName of namespaces) {
        const config = configs.find(e => e.uri == "metadata:" + namespaceName);
        if (config) continue; // Raw namespace data: No configuration associated
        const namespace = this.item.metadata[namespaceName];
        let values = [];
        const rawData = Object.keys(namespace);
        for (let key of rawData) {
          values.push({ id: key, description: key, value: Object.assign({}, rawData[key]) });
        }

        result.push({ name: namespaceName, values: values, hasconfig: false });
      }
      return result;
    },
    getSemanticLocation() {
      return this.item.tags.filter(e => this.$list.semantic.Location.has(e));
    },
    getSemanticProperty() {
      return this.item.tags.filter(e => this.$list.semantic.Property.has(e));
    },
    getSemanticPoint() {
      return this.item.tags.filter(e => this.$list.semantic.Point.has(e));
    },
    getSemanticEquipment() {
      return this.item.tags.filter(e => this.$list.semantic.Equipment.has(e));
    }
  },
  methods: {
    setLabel(event) {
      if (event.target.innerText.trim().length)
        this.item.label = event.target.innerText.trim();
      else {
        event.target.innerText = this.item.label;
      }
    },
    /**
     * Sets the semantic tags of one of the multi-select boxes.
     * The difficulty is that we need to merge that into the item.tags,
     * by removing every semantic tag of the given multi-select box type
     * and adding the selected ones back.
     * @param {Object} event multi-select input change event
     */
    setSemanticTag(event) {
      const selectedTags = event.target.valueArray;
      const dest = event.target.dataset.type;

      const itemTags = new Set(this.item.tags);
      const destTags = this.$list.semantic[dest].keys();
      for (let destTag of destTags) {
        itemTags.delete(destTag);
      }
      for (let tag of selectedTags) {
        itemTags.add(tag);
      }
      this.item.tags = [...itemTags];
      console.log("SETTYPE TAGS", selectedTags, itemTags, this.item.tags);
    },
    addMeta() {
      if (!this.$refs.namespacename.value.length) return;
      if (!this.$refs.namespacevalue.value.length) return;
      this.setMeta(this.$refs.namespacename.value, 'TEXT', "value", this.$refs.namespacevalue.value);
      this.$refs.namespacename.value = "";
      this.$refs.namespacevalue.value = "";
      this.$refs.namespacename.focus();
    },
    /**
     * At the moment "name" is always "value", because a namespace can only hold one single "value".
     */
    removeMeta(namespacename, name) {
      let data = this.item.metadata || {};
      if (!data[namespacename]) return;
      let promise = fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name + "/metadata/" + namespacename, "DELETE");
      promise.then(r => {
        this.messagetitle = "Removed '" + namespacename + "'";
        this.changeNotification();
        setTimeout(() => {
          this.inProgress = false;
        }, 500);
      }).catch(e => {
        console.log(e);
        if (e.status && e.status == 400) {
          this.message = "Meta writing failed!";
        } else
          this.message = e.toString();
      });
    },
    /**
     * At the moment "name" is always "value", because a namespace can only hold one single "value".
     */
    setMeta(namespacename, type, name, value) {
      let data = this.item.metadata || {};
      data = data[namespacename] || {};
      switch (type) {
        case "BOOLEAN":
          data[name] = value === "true";
          break;
        case "DECIMAL":
          data[name] = parseFloat(value);
          break;
        case "INTEGER":
          data[name] = parseInt(value);
          break;
        default:
          data[name] = value;
      }
      if (value == null) {
        delete data[name];
      }
      data = JSON.stringify(data);
      this.message = null;
      this.messagetitle = "Write meta: '" + namespacename + "'";
      this.inProgress = true;
      let promise;
      if (data.length == 2) // Empty object "{}"
        promise = fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name + "/metadata/" + namespacename, "DELETE");
      else
        promise = fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name + "/metadata/" + namespacename, "PUT", data);

      promise.then(r => {
        this.messagetitle = "Success '" + namespacename + "'";
        this.changeNotification();
        setTimeout(() => {
          this.inProgress = false;
        }, 500);
      }).catch(e => {
        console.log(e);
        if (e.status && e.status == 400) {
          this.message = "Meta writing failed!";
        } else
          this.message = e.toString();
      });
    },
    showIconDialog() {
      document.getElementById('change-icon-source').context = this.item;
    },
    setGroup(groupType) {
      if (groupType != "-")
        this.$set(this.item, "groupType", groupType);
      else
        this.$delete(this.item, "groupType");
    },
    setGroupFunction(value) {
      if (value)
        this.$set(this.item, "function", value);
      else
        this.$delete(this.item, "function");
    },
    setFunctionParameter(index, value) {
      if (!this.item.function) {
        console.warn("No function in setFunctionParameter");
        return;
      }
      if (!this.item.function.params)
        this.$set(this.item.function, 'params', []);
      while (this.item.function.params.length < index + 1) this.item.function.params.push(null);

      console.log("setFunctionParameter set", value, index);
      this.$set(this.item.function.params, index, value);
    },
    sendCommand() {
      const command = this.$el.querySelector(".commandInput").value;
      this.message = null;
      this.messagetitle = "Sending: '" + command + "'";
      this.inProgress = true;
      fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name, "POST", command, "text/plain")
        .then(r => {
          this.messagetitle = "Success '" + command + "'";
          this.inProgress = false;
        }).catch(e => {
          console.log(e);
          if (e.status && e.status == 400) {
            this.message = "Command not applicable for item type!";
          } else
            this.message = e.toString();
        });

    },
    remove() {
      this.message = null;
      this.messagetitle = "Removing item...";
      this.inProgress = true;
      fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name, "DELETE", null)
        .then(r => {
          this.message = "Item '" + this.item.label + "' removed";
          this.inProgress = false;
        }).catch(e => {
          this.message = e.toString();
        });
    },
    save() {
      this.message = null;
      this.messagetitle = "Saving item...";
      this.inProgress = true;
      this.changed = false;
      fetchMethodWithTimeout(store.host + "/rest/items/" + this.item.name, "PUT", JSON.stringify(this.item))
        .then(r => {
          this.message = "Item '" + this.item.label + "' saved";
          this.inProgress = false;
        }).catch(e => {
          this.message = e.toString();
        });
    }
  }
};

const ItemListMixin = {
  data() {
    return {
      viewmode: '0'
    }
  },
  mounted() {
    this.modelschema = schema;  // Don't freeze: The schema is adapted dynamically
  },
  computed: {
    groupItems: function () {
      return this.items.filter(e => e.type == 'Group');
    },
    itemtypes() {
      return this.store.itemtypes;
    },
    grouptypes() {
      return this.store.itemtypes.filter(e => e.group);
    },
    semantic() {
      return this.store.semantic;
    },
  },
  methods: {
    async saveAll(updated, created, removed) {
      let errorItems = [];
      console.log("saveAll", updated, created, removed);
      for (let c of created) updated.push(c);
      console.log("saveAll2", updated, created, removed);
      for (let item of updated) {
        await fetchMethodWithTimeout(store.host + "/rest/items/" + item.name, "PUT", JSON.stringify(item))
          .catch(e => {
            errorItems.push(item.name + ":" + e.toString());
          });
      }
      for (let item of removed) {
        await fetchMethodWithTimeout(store.host + "/rest/items/" + item.name, "DELETE")
          .catch(e => {
            errorItems.push(item.name + ":" + e.toString());
          });
      }
      if (errorItems.length) {
        throw new MultiRestError("Some objects failed", errorItems);
      } else {
        createNotification(null, `Updated ${updated.length}, Created ${created.length}, Removed ${removed.length} objects`, false, 1500);
      }
    }
  }
};

const mixins = [ItemsMixin];
const listmixins = [ItemListMixin];

export { mixins, listmixins, ModelAdapter };
