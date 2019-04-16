import { store, createNotification } from '../app.js';

class ModelAdapter {
  constructor() {
    this.STORE_ITEM_INDEX_PROP = Object.freeze("id");
    this.runtimeKeys = [];
    this.value = [];
  }
  stores() { return { "bundle-status": "value" } };
  async get(table = null, objectid = null, options = null) {
    this.value = await store.get("bundle-status", null, options);
  }
  dispose() {
  }
}

const UserInterfaceMixin = {
  data: function () {
    return {
      core: true,
      addons: true,
      aux: true,
    }
  },
  computed: {
    filtered() {
      return this.value.filter(v => {
        if (v.name.includes("Binding")) {
          return this.addons;
        } else if ((v.name.includes("Smarthome") || v.name.includes("openHAB"))) {
          return this.core;
        }
        return this.aux;
      });
    }
  },
  methods: {
    async reload() {
      await this.store.get(null);
      createNotification(null, `Bundles reloaded`, false, 1500);
    },
    stop(item) {
      createNotification(null, `Not yet supported by OH`, false, 1500);
    },
    start(item) {
      createNotification(null, `Not yet supported by OH`, false, 1500);
    },
    restart(item) {
      createNotification(null, `Not yet supported by OH`, false, 1500);
    }
  }
};

const mixins = [UserInterfaceMixin];

export { mixins, ModelAdapter };
