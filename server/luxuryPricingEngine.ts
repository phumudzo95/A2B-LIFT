const PRICING_CONFIG = {
  luxuryBaseFare: 120,
  luxuryPricePerKm: 18,
  luxuryPricePerMinute: 3,
  airportFee: 80,
  waitingTimeFee: 5,
  lateNightPremiumMultiplier: 1.3,
  commissionRate: 0.20,
};

export interface PriceEstimate {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  airportFee: number;
  lateNightPremium: number;
  totalPrice: number;
  currency: string;
}

export function calculatePrice(
  distanceKm: number,
  durationMin: number,
  options?: {
    isAirport?: boolean;
    isLateNight?: boolean;
  }
): PriceEstimate {
  const baseFare = PRICING_CONFIG.luxuryBaseFare;
  const distanceFare = distanceKm * PRICING_CONFIG.luxuryPricePerKm;
  const timeFare = durationMin * PRICING_CONFIG.luxuryPricePerMinute;

  let airportFee = 0;
  if (options?.isAirport) {
    airportFee = PRICING_CONFIG.airportFee;
  }

  let subtotal = baseFare + distanceFare + timeFare + airportFee;

  let lateNightPremium = 0;
  if (options?.isLateNight) {
    lateNightPremium = subtotal * (PRICING_CONFIG.lateNightPremiumMultiplier - 1);
    subtotal += lateNightPremium;
  }

  return {
    baseFare: Math.round(baseFare),
    distanceFare: Math.round(distanceFare),
    timeFare: Math.round(timeFare),
    airportFee: Math.round(airportFee),
    lateNightPremium: Math.round(lateNightPremium),
    totalPrice: Math.round(subtotal),
    currency: "ZAR",
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

export function getPricingConfig() {
  return { ...PRICING_CONFIG };
}
