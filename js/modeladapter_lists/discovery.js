import { store, fetchMethodWithTimeout, createNotification } from '../app.js';

class ModelAdapter {
  constructor() {
    this.STORE_ITEM_INDEX_PROP = Object.freeze("id");
    this.runtimeKeys = [];
    this.items = [];
    this.bindings = [];
  }
  stores() { return { "discovery": "items" } };
  getall(options = null) {
    return store.get("bindings", null, { force: true })
      .then(json => this.bindings = json.reduce((mapAccumulator, obj) => {
        mapAccumulator.set(obj.id, obj);
        return mapAccumulator;
      }, new Map()))
      .then(() => this.get(null, null, options))
  }
  async get(table = null, objectid = null, options = null) {
    this.items = await store.get("discovery", null, options);
  }
  dispose() {
  }
}

const DiscoveryMixin = {
  data: function () {
    return {
      activediscovery: false
    }
  },
  methods: {
    description() {
      const bindings = this.$list.store.bindings.get(this.item.id);
      if (bindings) return bindings.description;
      return "Binding not found";
    },
    label() {
      const bindings = this.$list.store.bindings.get(this.item.id);
      if (bindings) return bindings.name;
      return "Binding not found";
    },
    toggle() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;

      this.activediscovery = !this.activediscovery;
      if (this.activediscovery) {
        fetchMethodWithTimeout(store.host + "/rest/discovery/bindings/" + this.item.id + "/scan", "POST", null)
          .then(r => r.text())
          .then(r => {
            createNotification(null, `Discovery started for ${this.item.id}: Running ${r} seconds`, false, 2000);
            this.timer = setTimeout(() => {
              this.timer = null;
              this.activediscovery = false;
            }, r * 1000);
          }).catch(e => {
            if (this.timer) clearTimeout(this.timer);
            this.timer = null;
            this.activediscovery = false;
            createNotification(null, `Failed to start discovery for ${this.item.id}: ${e}`, false, 2000);
          });
      }
    },
  }
};

const mixins = [DiscoveryMixin];
const listmixins = [];

export { mixins, listmixins, ModelAdapter };
