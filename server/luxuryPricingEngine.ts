export const VEHICLE_CATEGORIES: Record<string, { name: string; pricePerKm: number; baseFare: number; examples: string }> = {
  budget: { name: "Budget", pricePerKm: 7, baseFare: 50, examples: "Toyota Corolla, Toyota Quest" },
  luxury: { name: "Luxury", pricePerKm: 13, baseFare: 100, examples: "BMW 3 Series, Mercedes C Class" },
  business: { name: "Business Class", pricePerKm: 40, baseFare: 150, examples: "BMW 5 Series, Mercedes E Class" },
  van: { name: "Van", pricePerKm: 13, baseFare: 120, examples: "Hyundai H1, Mercedes Vito, Staria" },
  luxury_van: { name: "Luxury Van", pricePerKm: 50, baseFare: 200, examples: "Mercedes V Class" },
};

const PRICING_CONFIG = {
  lateNightPremiumMultiplier: 1.3,
  commissionRate: 0.20,
};

export interface PriceEstimate {
  baseFare: number;
  distanceFare: number;
  totalPrice: number;
  pricePerKm: number;
  distanceKm: number;
  category: string;
  currency: string;
  lateNightPremium: number;
}

export function calculatePrice(
  distanceKm: number,
  categoryId: string,
  options?: {
    isLateNight?: boolean;
  }
): PriceEstimate {
  const category = VEHICLE_CATEGORIES[categoryId] || VEHICLE_CATEGORIES.budget;
  const baseFare = category.baseFare;
  const distanceFare = distanceKm * category.pricePerKm;

  let subtotal = baseFare + distanceFare;

  let lateNightPremium = 0;
  if (options?.isLateNight) {
    lateNightPremium = subtotal * (PRICING_CONFIG.lateNightPremiumMultiplier - 1);
    subtotal += lateNightPremium;
  }

  return {
    baseFare: Math.round(baseFare),
    distanceFare: Math.round(distanceFare),
    totalPrice: Math.round(subtotal),
    pricePerKm: category.pricePerKm,
    distanceKm: Math.round(distanceKm * 10) / 10,
    category: category.name,
    currency: "ZAR",
    lateNightPremium: Math.round(lateNightPremium),
  };
}

export function calculateChauffeurEarnings(totalPrice: number) {
  const commission = totalPrice * PRICING_CONFIG.commissionRate;
  const chauffeurEarnings = totalPrice - commission;
  return {
    totalPrice,
    commission: Math.round(commission),
    chauffeurEarnings: Math.round(chauffeurEarnings),
  };
}

export function getVehicleCategories() {
  return VEHICLE_CATEGORIES;
}

export function getPricingConfig() {
  return { ...PRICING_CONFIG, categories: VEHICLE_CATEGORIES };
}
