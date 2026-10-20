import { describe, expect, it, vi } from 'vitest';
import { candidateFor, isSuppressed, partitionSuppressed } from '../suppression.server';

function admin(data: unknown[], error: unknown = null) {
  const query: any = { select: () => query, or: () => query, limit: async () => ({ data, error }) };
  return { from: vi.fn(() => query) };
}
describe('real shared suppression lookup (local database mock)', () => {
  it('throws a sanitized error even when an error response also includes data', async () => {
    await expect(isSuppressed(admin([], { message: 'private detail', code: 'private-code' }),
      { email: 'synthetic@example.invalid' })).rejects.toThrow(/^Suppression lookup failed$/);
  });
  it('preserves normalized email primary matching', async () => {
    const candidate = candidateFor({ email: 'synthetic@example.invalid' });
    await expect(isSuppressed(admin([{ email_hmac: candidate.emailHmac }]),
      { email: ' SYNTHETIC@example.invalid ' })).resolves.toBe(true);
  });
  it('preserves normalized phone primary matching', async () => {
    const candidate = candidateFor({ phone: '+14155550132' });
    await expect(isSuppressed(admin([{ phone_hmac: candidate.phoneHmac }]),
      { phone: '(415) 555-0132' })).resolves.toBe(true);
  });
  it('never suppresses another occupant using address alone', async () => {
    const previous = candidateFor({ email: 'previous@example.invalid', street: '1 Synthetic St', zip: '30075' });
    await expect(isSuppressed(admin([{ email_hmac: previous.emailHmac, address_hmac: previous.addressHmac }]),
      { email: 'new@example.invalid', street: '1 Synthetic St', zip: '30075' })).resolves.toBe(false);
  });
  it('does not query the register without a primary identifier', async () => {
    const db = admin([], { message: 'must not be queried' });
    await expect(isSuppressed(db, { street: '1 Synthetic St', zip: '30075' })).resolves.toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });
  it('a successful empty lookup allows the candidate', async () => {
    await expect(isSuppressed(admin([]), { email: 'synthetic@example.invalid' })).resolves.toBe(false);
  });
  it('shared partitioning propagates the lookup failure instead of returning allowed rows', async () => {
    await expect(partitionSuppressed(admin([], { message: 'private detail' }),
      [{ email: 'synthetic@example.invalid' }], row => row)).rejects.toThrow(/^Suppression lookup failed$/);
  });
});
