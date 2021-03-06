Vue.component('metrics-table', {

  props: {

    object: {
      type: Object,
      required: true
    },

  },

  template: '\
    <dynamic-table :rows="rows"\
                   :fields="fields"\
                   @toggleField="toggleField">\
    </dynamic-table>\
  ',

  data: function() {
    return {
      fields: [],
      defaultFields: ['RxBytes', 'RxPackets', 'TxBytes', 'TxPackets'],
    };
  },

  created: function() {
    this.generateFields();
  },

  watch: {

    object: function() {
      if (this.fields.length === 0) this.generateFields();
      this.updateFields();
    },

    // check if all metrics eq to 0, after fields
    // are updated. if yes we show defaultFields
    fields: {
      handler: function() {
        if (this.zeroMetrics) {
          var self = this;
          this.fields.forEach(function(f) {
            if (self.defaultFields.indexOf(f.label) !== -1) {
              f.show = true;
            }
          });
        }
      },
      deep: true
    },

  },

  computed: {

    rows: function() {
      return [this.object];
    },

    zeroMetrics: function() {
      var self = this;
      return this.fields.reduce(function(zero, f) {
        if (!self.isTime(f) && f.show === true) {
          zero = false;
        }
        return zero;
      }, true);
    },

  },

  methods: {

    isTime: function(field) {
      return ['Start', 'Last'].indexOf(field.label) !== -1;
    },

    canShow: function(value) {
      if (typeof value === "string") return value.length > 0;
      return value > 0;
    },

    toggleField: function(field) {
      field.show = !field.show;
      // mark the field if is has been changed by the user
      field.showChanged = true;
    },

    generateFields: function() {
      // at creation show only fields that have a value gt 0
      var self = this;
      Object.getOwnPropertyNames(this.object).forEach(function(key) {
        if (key === "__ob__") return;
        var f = {
          name: [key],
          label: key,
          show: false,
          showChanged: false
        };
        // put Start and Last fields at the beginning
        if (self.isTime(f)) {
          f.show = true;
          self.fields.splice(0, 0, f);
        } else {
          f.show = self.canShow(self.object[key]);
          self.fields.push(f);
        }
      });
    },

    updateFields: function() {
      // show field automatically if some value is gt 0
      // unless it has been hidden or showed manually by
      // the user.
      var self = this;
      var fieldNameArray = [];
      this.fields.forEach(function(f) {
        fieldNameArray.push(f.name[0]);
        var newVal = self.object[f.name[0]];
        if (f.showChanged === false) {
          if (self.canShow(newVal) || self.isTime(f)) {
            f.show = true;
          } else {
            f.show = false;
          }
        }
      });

      // add the new fields
      Object.getOwnPropertyNames(this.object).forEach(function(key) {
        if (key === "__ob__") return;
        if (fieldNameArray.indexOf(key) >= 0) return;
        var f = {
          name: [key],
          label: key,
          show: self.canShow(self.object[key]),
          showChanged: false
        };
        self.fields.push(f);
      });
    },

  },


});
