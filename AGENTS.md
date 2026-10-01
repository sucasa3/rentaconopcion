<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Stripe mode is chosen by request host (preview/localhost → STRIPE_TEST_SECRET_KEY when set; everything else live); live/test price and customer ids live in separate columns — preview and production share one database and one secret store.
- Lender mortgage age falls back to the recorded date of the same active lien in the property record (client-facts); tenure stays tied to the uploaded close date — keeps rate/date/balance from one lien.
- Agent home-system access requires both an accepted general agent connection and a homeowner home-system grant; all saves/deletes go through versioned RPCs — keeps permissions layered and history atomic.
- Agent inspection reports attach only under the homeowner's combined "help_manage_home" grant (or a per-report "add once" choice); legacy systems-only grants keep their scope until the homeowner opts in — keeps document access explicit and separate.
