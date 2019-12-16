#!/usr/bin/env node

const execa = require('execa');
const getStream = require('get-stream');
const inquirer = require('inquirer');
const semver = require('semver')
const stripAnsi = require('strip-ansi');
const _ = require('lodash');

const tfVersionRegex = /Terraform v(.*)/;

// terraform v0.11
const addRegexV11 = /  + (.*)/;
const deleteRegexV11 = /  - (.*)/;

// terraform v0.12
const addRegexV12 = /  # (.*) will be created/;
const deleteRegexV12 = /  # (.*) will be destroyed/;

(async function run() {
  try {
    const plan = await parsePlan();
    await prompt(plan);
  } catch (err) {
    console.error(err);
  }
})();

async function parsePlan() {
  const tfVersionOut = await shell('terraform version', false);
  const tfVersion = tfVersionOut.match(tfVersionRegex)[1];
  console.info(`Runnning on Terraform v${tfVersion}`);

  let tfPlanOut = await shell('terraform plan');
  tfPlanOut = stripAnsi(tfPlanOut);

  let addRegex = addRegexV12
  let deleteRegex = deleteRegexV12
  if (semver.lt(tfVersion, '0.12.0')) {
    addRegex = addRegexV11
    deleteRegex = deleteRegexV11
  }
  const toAdd = parseResource(tfPlanOut, addRegex);
  const toDelete = parseResource(tfPlanOut, deleteRegex);

  return { toAdd, toDelete };
}

function parseResource(tfPlan, regex) {
  return tfPlan
    .split('\n')
    .filter(s => regex.test(s))
    .map(s => s.match(regex)[1]);
}

async function prompt(plan) {
  if (isEmpty(plan, 'toDelete')) return;
  const planAfterMove = await pickMove(plan);
  await prompt(planAfterMove);
}

async function isProceed() {
  const { isProceed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'isProceed',
    message: 'Move another resource?',
    default: true
  }]);
  return isProceed;
}

async function pickMove({ toDelete, toAdd }) {
  const { from, to } = await inquirer.prompt([{
    type: 'list',
    name: 'from',
    message: 'What move?',
    choices: toDelete
  }, {
    type: 'list',
    name: 'to',
    message: 'Move to:',
    choices: toAdd
  }]);
  const toDeleteAfterMove = _.remove(toDelete, item => item !== from);
  const toAddAfterMove = _.remove(toAdd, item => item !== to);

  await shell(`terraform state mv ${from} ${to}`);

  return { toDelete: toDeleteAfterMove, toAdd: toAddAfterMove };
}

function shell(command, printOutput = true) {
  const [first, ...other] = command.split(' ');
  const { stdout, stderr } = execa(first, other);

  if (printOutput) {
    stdout.pipe(process.stdout);
    stderr.pipe(process.stderr);
  }

  return getStream(stdout);
}

function isEmpty(object, key) {
  return _.isEmpty(_.get(object, key));
}
