/**
 * @category Web Components
 * @customelement ui-switch
 * @description A switch
 * @attribute [storekey] A localstorage key
 * @attribute [documentevent] An event with this name is send to the document on change
 * @example <caption>A switch</caption>
 * <ui-switch></ui-switch>
 */
class UiSwitch extends HTMLElement {
  constructor() {
    super();
  }
  setCheck(newState, noevents) {
    this.input.checked = newState;

    if (!noevents && !this.disabled) this.dispatchEvent(new Event("input"));
    if (this.showid) {
      const el = document.getElementById(this.showid);
      if (el) {
        if (this.input.checked) {
          el.classList.add("show");
          el.classList.remove("hidden");
        } else {
          el.classList.remove("show");
          el.classList.add("hidden");
        }
      }
    }
  }
  set value(newValue) {
    const nv = (newValue == 'true');

    if (this.input)
      this.setCheck(nv, true);
    else
      this._value = nv;
  }
  get value() {
    return this.input && this.input.checked;
  }
  connectedCallback() {
    this.storekey = this.hasAttribute("storekey") ? this.getAttribute("storekey") : null;
    this.documentevent = this.hasAttribute("documentevent") ? this.getAttribute("documentevent") : null;
    while (this.firstChild) { this.firstChild.remove(); }

    const root = this.appendChild(document.createElement("div"));

    root.classList.add("ui-switch");

    this.input = root.appendChild(document.createElement("input"));
    this.input.type = "checkbox";
    if (this.storekey) this.input.setAttribute("name", this.storekey);
    this.addEventListener("click", (e) => {
      e.preventDefault();
      this.setCheck(!this.input.checked);
      if (this.storekey) localStorage.setItem(this.storekey, this.input.checked);
      if (this.documentevent) document.dispatchEvent(new Event(this.documentevent));
    });
    root.appendChild(document.createElement("span"));
    const titleEl = root.appendChild(document.createElement("div"));

    this.showid = this.hasAttribute("showid") ? this.getAttribute("showid") : null;
    titleEl.title = this.hasAttribute("title") ? this.getAttribute("title") : "";
    titleEl.innerHTML = this.hasAttribute("label") ? this.getAttribute("label") : (this.hasAttribute("title") ? this.getAttribute("title") : "");
    if (this.disabled) this.classList.add("disabled"); else this.classList.remove("disabled");

    this.attributeChangedCallback("showid");
    const isChecked = this.hasAttribute("checked") ? this.getAttribute("checked") == "true" : this._value;
    const cached = this.storekey ? localStorage.getItem(this.storekey) == "true" : this._value;
    window.requestAnimationFrame(() => this.setCheck(isChecked || cached, true));
  }
  static get observedAttributes() {
    return ['checked'];
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.input) return;
    if (name == "checked") {
      this.setCheck(this.getAttribute("checked") == "true");
    } else if (name == "disabled")
      this.disabled = this.hasAttribute("disabled") ? this.getAttribute("disabled") : false;
    else if (name == "showid") {
      this.showid = this.hasAttribute("showid") ? this.getAttribute("showid") : null;
    }
  }
}

customElements.define('ui-switch', UiSwitch);
