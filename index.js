#!/usr/bin/env node

const inquirer = require('inquirer');
const execa = require('execa');
const getStream = require('get-stream');
const _ = require('lodash');

const addDelimiter = '\u001b[32m  \u001b[32m+\u001b[0m \u001b[32m';
const deleteDelimiter = '\u001b[31m  \u001b[31m-\u001b[0m \u001b[31m';
const toTrim = '\u001b[0m';

(async function run() {
  try {
    const plan = await parsePlan();
    await prompt(plan);
  } catch (err) {
    console.error(err);
  }
})();

async function parsePlan() {
  const stdout = await shell('terraform plan');

  const toAdd = parseResource(stdout, addDelimiter);
  const toDelete = parseResource(stdout, deleteDelimiter);

  return { toAdd, toDelete };
}

function parseResource(stdout, delimiter) {
  return stdout
    .split('\n')
    .filter(s => s.includes(delimiter))
    .map(s => s.replace(delimiter, '').replace(toTrim, ''));
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

function shell(command) {
  const [first, ...other] = command.split(' ');
  const { stdout, stderr } = execa(first, other);

  stdout.pipe(process.stdout);
  stderr.pipe(process.stderr);

  return getStream(stdout);
}

function isEmpty(object, key) {
  return _.isEmpty(_.get(object, key));
}
