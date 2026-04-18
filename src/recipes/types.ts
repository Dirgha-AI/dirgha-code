export interface RecipeParameter {
  name: string;
  description?: string;
  required?: boolean;
  default?: string;
}

export interface RecipeSettings {
  model?: string;
  maxTurns?: number;
}

export interface Recipe {
  title: string;
  description?: string;
  instructions: string;
  parameters?: RecipeParameter[];
  settings?: RecipeSettings;
}
