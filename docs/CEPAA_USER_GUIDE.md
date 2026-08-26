# CEPAA user guide

Production application: `https://wrike-clone-three.vercel.app`

This guide covers the supported CEPAA task-tracking workflow for Atul, Aparna, Shivam, Sachin, and future team members.

## Sign in safely

1. Open the production application URL in a current browser.
2. Enter the work email and password provided by the CEPAA administrator.
3. If prompted to change a temporary password, create a unique password that is not used on another service.
4. Do not share passwords, access tokens, screenshots containing private task data, or downloaded reports outside the approved team.

If sign-in fails repeatedly, stop trying and contact the internal support owner. Repeated attempts may temporarily lock the account.

## Understand the dashboard

The dashboard shows the work visible to your current role and department:

- Team capacity shows open task counts by visible team member.
- Work completion compares completed, active, and overdue work in the current scope.
- Task lists and charts use the same role-based visibility rules.
- Filters narrow the current view; they do not change task ownership or permissions.

Managers can see their own tasks, employee tasks, unassigned tasks, and peer-manager tasks in departments they manage. A manager's task remains view-only for another manager.

## Create and assign a task

1. Select the correct department, workspace, project, or folder.
2. Create the task with a clear title and enough description for the assignee to act.
3. Choose an assignee, priority, status, start date, and due date where applicable.
4. Save the task and confirm it appears in the expected project and dashboard scope.

Managers may assign work to employees or themselves. They cannot take control of or edit a peer manager's task. Ask a department head or administrator when ownership must cross manager boundaries.

## Use task statuses consistently

- `To Do`: accepted work that has not started.
- `In Progress`: work currently being performed.
- `Blocked`: work cannot proceed; add a comment explaining the blocker and required action.
- `Completed`: work is finished and any required handoff has been confirmed.

Do not mark work completed only to remove it from the active dashboard. Resolve blockers, complete the handoff, and keep comments factual and useful.

## Complete and hand off work

Some tasks require a handoff before completion:

1. Finish the work and mark the handoff ready.
2. The appropriate recipient confirms the handoff.
3. Complete the task only after confirmation.

The system prevents incomplete confirmation records and preserves the completion history. If a task was completed incorrectly, ask the authorized owner to reopen it rather than creating a duplicate.

## Comments, files, and notifications

- Use comments for progress, decisions, and blockers related to the task.
- Upload only approved work files; downloads use short-lived private links.
- Email and in-app notifications are reminders. The task record in CEPAA is the source of truth.
- Report a suspicious link or unexpected notification instead of entering credentials through it.

## Spreadsheet imports

Before importing work from Excel:

- Use the approved CEPAA workbook format.
- Use only recognized assignee names and statuses.
- Check dates, duplicate titles, department/project placement, and completed-task status.
- Back up the database and test the import against a non-production environment first.
- Reconcile row counts and spot-check assignments after import.

Never import directly into production tables with ad-hoc SQL. Use the reviewed import process so tenant IDs, users, task history, and role rules remain intact.

## Getting help

When reporting a problem, include:

- the page and task title;
- what you expected and what occurred;
- the approximate time;
- a screenshot that does not expose passwords, tokens, or unrelated private data.

Do not send passwords or secret keys to the support owner.
