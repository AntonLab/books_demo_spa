// An `include` marked required always carries its row; the association's
// type cannot say so.
export function joined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('A required include came back without its row');
  }
  return value;
}
