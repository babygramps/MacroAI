export interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'energy-kcal'?: number;
  proteins_100g?: number;
  proteins?: number;
  carbohydrates_100g?: number;
  carbohydrates?: number;
  fat_100g?: number;
  fat?: number;
}

export interface OFFProduct {
  code: string;
  product_name: string;
  nutriments: OFFNutriments;
  serving_size?: string;
}

export interface OFFResponse {
  status: number;
  product: OFFProduct;
}
