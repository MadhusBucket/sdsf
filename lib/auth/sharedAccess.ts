/**
 * Email mapping for shared workspace.
 * Maps secondary emails to primary user email.
 * Both emails will see and modify the same data.
 */
const EMAIL_TO_PRIMARY: Record<string, string> = {
  'chdayanand108@gmail.com': 'madhusudhanspostbox@gmail.com',
};

export function getPrimaryEmail(email: string): string {
  return EMAIL_TO_PRIMARY[email.toLowerCase()] || email;
}

export async function getEffectiveUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  currentUserId: string,
  currentEmail: string
): Promise<string> {
  const primaryEmail = getPrimaryEmail(currentEmail);

  if (primaryEmail === currentEmail) {
    return currentUserId;
  }

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', primaryEmail)
    .single();

  return data?.id || currentUserId;
}
