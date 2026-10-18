type Book = { id: string; assigned_user_id?: string | null };

/** Never infer personal intake ownership from a team book's array position. */
export function personalBook<T extends Book>(books: T[], userId: string): T | null {
  return books.filter((b) => b.assigned_user_id === userId)
    .sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

export async function assertPersonalBook(db: any, userId: string, portfolioId: string) {
  const { data: book, error } = await db.from("lender_portfolios")
    .select("id, lender_org_id, assigned_user_id")
    .eq("id", portfolioId).maybeSingle();
  if (error || !book || book.assigned_user_id !== userId) {
    throw new Error("Add homeowners to your own book. Team assignment is a separate manager action.");
  }
  const { data: member } = await db.from("lender_members").select("user_id")
    .eq("lender_org_id", book.lender_org_id).eq("user_id", userId).maybeSingle();
  if (!member) throw new Error("Active workspace membership required");
  return book;
}