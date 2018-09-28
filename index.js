const YAML = require('yamljs');

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

flowRunner(operations, err => {
  console.error(err);
});

function flowRunner(tasks, callback) {
  const numTasks = Object.keys(tasks).length;
  let results = {};
  let runningTasks = 0;
  let canceled = false;
  let hasError = false;

  let listeners = Object.create(null);

  let readyTasks = [];

  let readyToCheck = [];
  let uncheckedDependencies = {};

  Object.keys(tasks).forEach(key => {
    let task = tasks[key];
    if (!Array.isArray(task)) {
      enqueueTask(key, [task]);
      readyToCheck.push(key);
      return;
    }

    const dependencies = task.slice(0, task.length - 1);
    let remainingDependencies = dependencies.length;
    if (remainingDependencies === 0) {
      enqueueTask(key, task);
      readyToCheck.push(key);
      return;
    }
    uncheckedDependencies[key] = remainingDependencies;

    dependencies.forEach(dependencyName => {
      if (!tasks[dependencyName]) {
        throw new Error('task `' + key +
          '`non-existent dependency `' +
          dependencyName + '` in ' +
          dependencies.join(', '));
      }
      addListener(dependencyName, () => {
        remainingDependencies--;
        if (remainingDependencies === 0) {
          enqueueTask(key, task);
        }
      });
    });
  });

  checkForDeadlocks();
  processQueue();

  function enqueueTask(key, task) {
    readyTasks.push(() => runTask(key, task));
  }

  function processQueue() {
    if (canceled) return;
    if (readyTasks.length === 0 && runningTasks === 0) {
      return callback(null, results);
    }
    while(readyTasks.length && runningTasks < numTasks) {
      const run = readyTasks.shift();
      run();
    }
  }

  function addListener(taskName, fn) {
    let taskListeners = listeners[taskName];
    if (!taskListeners) {
      taskListeners = listeners[taskName] = [];
    }

    taskListeners.push(fn);
  }

  function taskComplete(taskName) {
    const taskListeners = listeners[taskName] || [];
    taskListeners.forEach(fn => fn());
    processQueue();
  }


  function runTask(key, task) {
    if (hasError) return;

    const taskCallback = (err, ...result) => {
      runningTasks--;
      if (err === false) {
        canceled = true;
        return
      }
      if (result.length < 2) {
        [result] = result;
      }
      if (err) {
        let safeResults = {};
        Object.keys(results).forEach(rkey => {
          safeResults[rkey] = results[rkey];
        });
        safeResults[key] = result;
        hasError = true;
        listeners = Object.create(null);
        if (canceled) {
          return;
        }
        callback(err, safeResults);
      } else {
        results[key] = result;
        taskComplete(key);
      }
    };

    runningTasks++;
    const taskFn = task[task.length - 1];
    if (task.length > 1) {
      taskFn(results, taskCallback);
    } else {
      taskFn(taskCallback);
    }
  }

  function checkForDeadlocks() {
    // https://en.wikipedia.org/wiki/Topological_sorting#Kahn.27s_algorithm
    let currentTask;
    let counter = 0;
    while (readyToCheck.length) {
      currentTask = readyToCheck.pop();
      counter++;
      getDependents(currentTask).forEach(dependent => {
        if (--uncheckedDependencies[dependent] === 0) {
          readyToCheck.push(dependent);
        }
      });
    }

    if (counter !== numTasks) {
      throw new Error(
        'cannot execute tasks due to a recursive dependency'
      );
    }
  }

  function getDependents(taskName) {
    const result = [];
    Object.keys(tasks).forEach(key => {
      const task = tasks[key];
      if (Array.isArray(task) && task.indexOf(taskName) >= 0) {
        result.push(key);
      }
    });
    return result;
  }
}
