export const ROLL_CLAIM_PENDING_SECONDS = 24 * 60 * 60;

export function normalizeRollNo(value: string | undefined) {
  const rollNo = value?.trim().toUpperCase() ?? '';
  return rollNo.length >= 2 && rollNo.length <= 64 ? rollNo : undefined;
}

export function rollClaimKey(rollNo: string) {
  return `ROLL#${rollNo}`;
}
