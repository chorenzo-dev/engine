import { Command } from 'commander';
import { performAnalysis } from './commands/analyze';

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
      console.log('🔍 Analyzing workspace...\n');
      
      const result = await performAnalysis();
      
      console.log('\n✅ Analysis complete!');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.metadata) {
        console.log(`\n💰 Cost: $${result.metadata.cost_usd.toFixed(4)}`);
        console.log(`🔄 Turns: ${result.metadata.turns}`);
      }
      
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

program.parse(process.argv);