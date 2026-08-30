export type ExistingInviteRecipient = {
  id: string;
  email: string | null;
  status: string;
  roleNames: string[];
};

export function planInviteRecipients(args: {
  inviteEmails: string[];
  existingUsers: ExistingInviteRecipient[];
  activeStatus: string;
  studentRoleName: string;
}) {
  const requested = new Set(args.inviteEmails);
  const usersByEmail = new Map(
    args.existingUsers
      .map((user) => [normalizeEmail(user.email), user] as const)
      .filter(([email]) => email && requested.has(email)),
  );
  const existingUserEmails: string[] = [];
  const blockedEmails: string[] = [];
  const nonStudentEmails: string[] = [];
  const directUserIds: string[] = [];
  const pendingInviteEmails: string[] = [];

  for (const email of args.inviteEmails) {
    const user = usersByEmail.get(email);
    if (!user) {
      pendingInviteEmails.push(email);
      continue;
    }
    existingUserEmails.push(email);
    if (user.status !== args.activeStatus) {
      blockedEmails.push(email);
    } else if (!user.roleNames.includes(args.studentRoleName)) {
      nonStudentEmails.push(email);
    } else {
      directUserIds.push(user.id);
    }
  }

  return {
    existingUserEmails,
    blockedEmails,
    nonStudentEmails,
    directUserIds: [...new Set(directUserIds)],
    pendingInviteEmails,
  };
}

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}
