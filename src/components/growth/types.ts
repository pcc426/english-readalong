export interface GrowthDay {
  date: string;
  stars: number;
  checkedIn: boolean;
  partial: boolean;
}

export interface GrowthBalance {
  date: string;
  balance: number;
}

export interface GrowthSnapshot {
  totalStars: number;
  streakDays: number;
  launchMonth: string;
  launchDate: string;
  month: string;
  isCurrentMonth: boolean;
  preLaunch: boolean;
  monthStars: number;
  days: GrowthDay[];
  balances: GrowthBalance[];
}
