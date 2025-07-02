#!/usr/bin/env node
import { Command } from 'commander';
import { findGitRoot } from './utils/git.utils.js';
import { buildFileTree } from './utils/file-tree.utils.js';

const program = new Command();

program
  .name('chorenzo')
  .version('0.1.0')
  .description('Open-source CLI engine for workspace analysis and automation');

program
  .command('analyze')
  .description('Analyze your workspace structure and provide insights')
  .action(async () => {
    try {
      console.log('🔍 Analyzing workspace...');
      
      const gitRoot = await findGitRoot();
      console.log(`📁 Found git repository at: ${gitRoot}`);
      
      console.log('\n📊 Building file tree (max 3 levels)...\n');
      const fileTree = await buildFileTree(gitRoot, undefined, 3);
      console.log(fileTree);
      
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse();