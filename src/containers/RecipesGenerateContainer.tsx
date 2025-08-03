import { Text } from 'ink';
import React, { useEffect, useState } from 'react';

import { performRecipesGenerate } from '~/commands/recipes';
import { MetadataDisplay } from '~/components/MetadataDisplay';
import { RecipeInfoCollection } from '~/components/RecipeInfoCollection';
import { Step, StepContext, StepSequence } from '~/components/StepSequence';
import { BaseContainerOptions } from '~/types/common';
import {
  RecipesGenerateOptions,
  RecipesGenerateResult,
} from '~/types/recipes-generate';

function buildRetryCliCommand(options: RecipesGenerateOptions): string {
  if (!options.name) {
    return '';
  }

  let cliCommand = `npx chorenzo recipes generate "${options.name}"`;
  if (options.category) {
    cliCommand += ` --category "${options.category}"`;
  }
  if (options.summary) {
    cliCommand += ` --summary "${options.summary}"`;
  }
  if (options.saveLocation) {
    cliCommand += ` --location "${options.saveLocation}"`;
  }
  if (options.ecosystemAgnostic) {
    cliCommand += ` --ecosystem-agnostic`;
  }
  return cliCommand;
}

interface RecipesGenerateContainerOptions
  extends RecipesGenerateOptions,
    BaseContainerOptions {}

interface RecipesGenerateContainerProps {
  options: RecipesGenerateContainerOptions;
  onError: (error: Error) => void;
}

export const RecipesGenerateContainer: React.FC<
  RecipesGenerateContainerProps
> = ({ options, onError }) => {
  const steps: Step[] = [
    {
      id: 'collect',
      title: 'Collect recipe information',
      component: (context: StepContext) => {
        const [collectionComplete, setCollectionComplete] = useState(false);

        useEffect(() => {
          if (collectionComplete) {
            context.complete();
          }
        }, [collectionComplete, context]);

        return (
          <RecipeInfoCollection
            initialOptions={options}
            onComplete={(collectedOptions) => {
              context.setResult(collectedOptions);
              setCollectionComplete(true);
            }}
            onError={(error) => context.setError(error.message)}
          />
        );
      },
    },
    {
      id: 'generate',
      title: 'Generating recipe',
      component: (context: StepContext) => {
        useEffect(() => {
          const runGenerate = async () => {
            context.setProcessing(true);
            let lastActivity = '';

            try {
              const collectedOptions =
                context.getResult<RecipesGenerateOptions>('collect');
              const finalOptions = { ...options, ...collectedOptions };

              const result = await performRecipesGenerate(
                finalOptions,
                (step, isThinking) => {
                  if (step) {
                    lastActivity = step;
                    context.setActivity(step, isThinking);
                  } else if (isThinking !== undefined && lastActivity) {
                    context.setActivity(lastActivity, isThinking);
                  }
                }
              );

              if (result) {
                context.setResult(result);
              }
              context.complete();
            } catch (error) {
              const collectedOptions =
                context.getResult<RecipesGenerateOptions>('collect');
              let errorMessage =
                error instanceof Error ? error.message : String(error);

              const cliCommand = buildRetryCliCommand(collectedOptions || {});
              if (cliCommand) {
                errorMessage += `\n\nCLI command to retry:\n${cliCommand}`;
              }

              context.setError(errorMessage);
              onError(new Error(errorMessage));
            }
          };

          runGenerate();
        }, []);

        return null;
      },
    },
  ];

  return (
    <StepSequence
      steps={steps}
      completionTitle="Recipe generated successfully!"
      completionComponent={(context: StepContext) => {
        const result = context.getResult<RecipesGenerateResult>('generate');
        if (result) {
          return (
            <>
              <Text>Path: {result.recipePath}</Text>
              <Text>Name: {result.recipeName}</Text>
              {result.metadata && (
                <MetadataDisplay
                  metadata={result.metadata}
                  showCost={options.cost}
                />
              )}
            </>
          );
        }
        return null;
      }}
      errorTitle="Recipe generation failed!"
      options={options}
      debugMode={options.debug}
    />
  );
};
