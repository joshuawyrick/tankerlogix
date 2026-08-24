import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, decimals = 2): string {
  return `$${value.toFixed(decimals)}`;
}

export function formatDistance(miles: number): string {
  return `${miles.toFixed(1)} mi`;
}

export function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export function generateLocationId(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Remove non-alphanumeric except spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

