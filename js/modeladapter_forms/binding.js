import { store } from '../app.js'; // Pre-bundled, external reference

class ModelAdapter {
  constructor() {
    this.STORE_ITEM_INDEX_PROP = Object.freeze("id");
    this.runtimeKeys = [];
    this.value = {};
  }
  stores() { return { "bindings": "value", "binding-config": "config" } };
  get(table = null, objectid = null, options = null) {
    return store.get("bindings", objectid, options)
      .then(v => this.value = v)
      .then(() => this.value.configDescriptionURI ?
        store.get("config-descriptions", this.value.configDescriptionURI, { force: true }) : null)
      .then(v => this.configDescription = v)
      .then(() => store.get("binding-config", objectid, { force: true }))
      .then(v => this.config = v);
  }
  dispose() {
  }
}

const BindingsMixin = {
  mounted: function () {
    if (this.store.config) {
      this.config = Object.assign({}, this.store.config);
      this.originalConfig = this.store.config;

      console.log("BindingsMixin", this.config);
    }
  },
  data: function () {
    return {
      modifiedConfig: {},
    }
  },
  computed: {
    configDescription: function () {

    },
  },
  methods: {
    hasConfDescParams() {
      return this.store.configDescription && this.store.configDescription.parameters;
    },
    getConfDescParams() {
      console.log("BindingsMixin:getConfDescParams", this.store.configDescription.parameters);
      return this.store.configDescription.parameters;
    },
    getConfigValue(param) {
      console.log("BindingsMixin:getConfigValue", this.store.config);
      if (this.store.config)
        return this.store.config[param.name] || param.defaultValue;
      else return "";
    },
    setConfigValue() {
      console.log("CONFIG", arguments);
      //Vue.set(config, arguments[0], arguments[1])
    }
  }
}

const mixins = [BindingsMixin];
export { mixins, ModelAdapter };
