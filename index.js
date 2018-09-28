const YAML = require('yamljs');
const async = require('async');

const flow = YAML.load('flow.yml');

const operations = {};

flow.steps.forEach(flowItem => {
  if (!flowItem.depends_on) {
    operations[flowItem.name] = (item => cb => {
      item.logic.forEach(logicItem => console.log(logicItem));
      return cb();
    })(flowItem);

    return;
  }

  operations[flowItem.name] = (item => [...flowItem.depends_on, (data, cb) => {
    item.logic.forEach(logicItem => console.log(logicItem));
    return cb();
  }])(flowItem);
});

async.auto(operations, err => {
  console.error(err);
});
