export interface USDAFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface USDAFoodPortion {
  id: number;
  gramWeight: number;
  amount: number;
  modifier?: string;
  measureUnit?: {
    id: number;
    name: string;
    abbreviation: string;
  };
  portionDescription?: string;
  sequenceNumber?: number;
}

export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: USDAFoodNutrient[];
  brandOwner?: string;
  brandName?: string;
  ingredients?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodCategory?: string;
  score?: number;
  foodPortions?: USDAFoodPortion[];
  householdServingFullText?: string;
}

export interface USDASearchResponse {
  foods: USDAFood[];
  totalHits: number;
}
