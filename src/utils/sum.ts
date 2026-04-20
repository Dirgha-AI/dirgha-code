/**
 * Returns the sum of an array of numbers.
 * @param numbers Array of numbers to sum
 * @returns Total sum
 */
export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

// Example usage:
// sum([1, 2, 3]) // => 6