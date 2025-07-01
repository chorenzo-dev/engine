#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('chorenzo')
  .version('0.1.0')
  .description('Open-source CLI engine that automates your engineering workflow with AI-powered workspace analysis');

program
  .command('analyze')
  .description('Analyze your workspace and provide detailed insights')
  .action(() => {
    console.log('🔍 Analyzing workspace... (Hello World from analyze command!)');
  });

program.parse();