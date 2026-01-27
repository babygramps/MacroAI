'use server';

import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data';
import type { Schema } from '@/amplify/data/resource';
import { cookies } from 'next/headers';
import type { RecipeEntry, RecipeIngredientEntry, RecipesResponse } from '@/lib/types';

// Get server client for DynamoDB operations
async function getServerClient() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const outputs = require('@/amplify_outputs.json');
    return generateServerClientUsingCookies<Schema>({
      config: outputs,
      cookies: cookies,
    });
  } catch {
    return null;
  }
}

function mapRecipeIngredient(ing: Schema['RecipeIngredient']['type']): RecipeIngredientEntry {
  return {
    id: ing.id,
    recipeId: ing.recipeId,
    name: ing.name,
    weightG: ing.weightG,
    calories: ing.calories,
    protein: ing.protein,
    carbs: ing.carbs,
    fat: ing.fat,
    source: ing.source,
    sortOrder: ing.sortOrder ?? 0,
  };
}

/**
 * Fetches all saved recipes for the current user, ordered by creation date (newest first).
 * Includes all ingredients for each recipe.
 */
export async function getRecipes(): Promise<RecipesResponse> {
  const client = await getServerClient();
  
  if (!client) {
    return { recipes: [] };
  }

  try {
    // Fetch all recipes
    const { data: recipesData } = await client.models.Recipe.list();
    
    if (!recipesData || recipesData.length === 0) {
      return { recipes: [] };
    }

    // Sort by createdAt descending (newest first)
    const sortedRecipes = recipesData.toSorted(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Fetch ingredients for all recipes in parallel
    const recipesWithIngredients = await Promise.all(
      sortedRecipes.map(async (recipe) => {
        const { data: ingredientsData } = await client.models.RecipeIngredient.listRecipeIngredientByRecipeId({
          recipeId: recipe.id,
        });

        const ingredients = (ingredientsData || [])
          .map(mapRecipeIngredient)
          .toSorted((a, b) => a.sortOrder - b.sortOrder);

        const entry: RecipeEntry = {
          id: recipe.id,
          name: recipe.name,
          description: recipe.description ?? null,
          totalYieldG: recipe.totalYieldG,
          totalServings: recipe.totalServings,
          servingDescription: recipe.servingDescription ?? null,
          servingSizeG: recipe.servingSizeG ?? null,
          totalCalories: recipe.totalCalories,
          totalProtein: recipe.totalProtein,
          totalCarbs: recipe.totalCarbs,
          totalFat: recipe.totalFat,
          sourceUrl: recipe.sourceUrl ?? null,
          createdAt: recipe.createdAt,
          ingredients,
        };

        return entry;
      })
    );

    return { recipes: recipesWithIngredients };
  } catch (error) {
    console.error('Error fetching recipes:', error);
    return { recipes: [] };
  }
}

/**
 * Fetches a single recipe by ID with all its ingredients.
 */
export async function getRecipeById(recipeId: string): Promise<RecipeEntry | null> {
  const client = await getServerClient();
  
  if (!client) {
    return null;
  }

  try {
    const { data: recipe } = await client.models.Recipe.get({ id: recipeId });
    
    if (!recipe) {
      return null;
    }

    const { data: ingredientsData } = await client.models.RecipeIngredient.listRecipeIngredientByRecipeId({
      recipeId: recipe.id,
    });

    const ingredients = (ingredientsData || [])
      .map(mapRecipeIngredient)
      .toSorted((a, b) => a.sortOrder - b.sortOrder);

    return {
      id: recipe.id,
      name: recipe.name,
      description: recipe.description ?? null,
      totalYieldG: recipe.totalYieldG,
      totalServings: recipe.totalServings,
      servingDescription: recipe.servingDescription ?? null,
      servingSizeG: recipe.servingSizeG ?? null,
      totalCalories: recipe.totalCalories,
      totalProtein: recipe.totalProtein,
      totalCarbs: recipe.totalCarbs,
      totalFat: recipe.totalFat,
      sourceUrl: recipe.sourceUrl ?? null,
      createdAt: recipe.createdAt,
      ingredients,
    };
  } catch (error) {
    console.error('Error fetching recipe:', error);
    return null;
  }
}

/**
 * Deletes a recipe and all its ingredients.
 */
export async function deleteRecipe(recipeId: string): Promise<boolean> {
  const client = await getServerClient();
  
  if (!client) {
    return false;
  }

  try {
    // Delete all ingredients first
    const { data: ingredientsData } = await client.models.RecipeIngredient.listRecipeIngredientByRecipeId({
      recipeId,
    });

    if (ingredientsData && ingredientsData.length > 0) {
      await Promise.all(
        ingredientsData.map((ing) => client.models.RecipeIngredient.delete({ id: ing.id }))
      );
    }

    // Delete the recipe
    await client.models.Recipe.delete({ id: recipeId });

    return true;
  } catch (error) {
    console.error('Error deleting recipe:', error);
    return false;
  }
}
