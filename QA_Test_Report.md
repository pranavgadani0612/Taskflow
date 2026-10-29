# QA Test Report

Application: Padhya Software Technologies - Internal Employee Portal (TaskFlow)

URL: https://aliceblue-wasp-870365.hostingersite.com/ \| Date: 26 Oct 2026 \| Role tested: Super Admin only

# 1. Summary

Overall status: PARTLY WORKING. Core create/read/update flows work and HTML/script input is safely escaped. Weak spots are inconsistent delete handling, missing edit/delete in several modules, a failing billing API, and date/timezone handling. Testing was incomplete (see Not tested).

Bugs by severity: Critical 0, High 3, Medium 11, Low 12 - total 26.

# 2. Modules tested

| **Module**                                                                                 | **Create**                 | **Read** | **Update**     | **Delete**            | **Status**       |
|--------------------------------------------------------------------------------------------|----------------------------|----------|----------------|-----------------------|------------------|
| Holidays                                                                                   | Pass                       | Pass     | No Edit        | Pass (native confirm) | Partly working   |
| Roles                                                                                      | Pass                       | Pass     | Pass           | Pass (modal confirm)  | Working          |
| Notice Board                                                                               | Pass                       | Pass     | No Edit        | Pass (no confirm)     | Partly working   |
| Tickets                                                                                    | Pass                       | Pass     | Status only    | None                  | Partly working   |
| IT Assets                                                                                  | Pass                       | Pass     | None           | None                  | Partly working   |
| Attendance                                                                                 | Pass                       | Pass     | Pass (status)  | Pass (native confirm) | Partly working   |
| WFH / On-Duty                                                                              | Pass                       | Pass     | Approve/Reject | None                  | Partly working   |
| Permission                                                                                 | Not tested                 | Pass     | Not tested     | Not tested            | Working (read)   |
| Expenses                                                                                   | Validation only            | Loads    | Not tested     | Not tested            | Not fully tested |
| Client Invoicing                                                                           | \-                         | HTTP 500 | \-             | \-                    | Not working      |
| Dashboard, Time, Rating, Breaks, Resource, Profile, Directory, Payroll, Chat, Audit, Leave | Not tested                 | Loads    | Not tested     | Not tested            | Read-only check  |
| Staff                                                                                      | Skipped (creates accounts) | Pass     | Skipped        | Skipped               | Not tested       |

# 3. Bug list

Screenshots were captured during testing but not saved per bug; reproduce steps are listed for each.

| **ID** | **Page**               | **Description**                                                                                          | **Steps**                                           | **Expected**                   | **Actual**                      | **Severity** |
|--------|------------------------|----------------------------------------------------------------------------------------------------------|-----------------------------------------------------|--------------------------------|---------------------------------|--------------|
| B1     | Tickets                | Ticket title accepts 300+ chars; long unbroken text pushes Actions column off-screen                     | Raise ticket, 300+ char title, submit               | Length limit; wrapped layout   | Saved; layout overflows         | High         |
| B2     | Tickets, Assets        | No Edit/Delete for admin                                                                                 | Create QA record, look for delete                   | Record can be removed          | No delete/edit in UI            | High         |
| B20    | Client Invoicing       | Billing report API returns HTTP 500; page shows empty state "No client reports available"                | Open /client-reports; check console                 | Data or a visible error        | 500 error hidden as empty state | High         |
| B3     | Notice Board           | Delete is instant with no confirmation (Roles uses modal, Holidays/Attendance native confirm)            | Click trash on announcement                         | Confirmation                   | Deleted at once                 | Medium       |
| B4     | Holidays               | No Edit action                                                                                           | Open holiday card                                   | Edit available                 | Delete only                     | Medium       |
| B5     | Notice Board           | No Edit action                                                                                           | Open announcement                                   | Edit available                 | Delete only                     | Medium       |
| B6     | Holidays               | List shows 2026 only; a 2020 holiday is invisible and undeletable; past dates accepted                   | Add holiday dated 2020                              | Validation or year selector    | Saved, hidden                   | Medium       |
| B7     | IT Assets              | Negative purchase cost accepted                                                                          | Add asset, cost -500                                | Rejected                       | Saved                           | Medium       |
| B8     | Tickets                | Item Type does not depend on Category                                                                    | Choose Category Software                            | Relevant items                 | Still Mouse/Keyboard list       | Medium       |
| B9     | Attendance             | Present with no clock-out shows 8.00 hrs; manual entry without times shows 8.00 hrs (Half Day sets 4.00) | View Krishana row; add manual entry for Super Admin | Hours blank/derived from times | Fixed hours shown               | Medium       |
| B10    | Audit Logs             | Module filter lists only Announcements, Asset Mgmt, Holidays; Roles/Tickets not logged                   | Open filter                                         | All modules                    | Three modules only              | Medium       |
| B11    | Audit Logs             | Timestamps appear in UTC, not local IST (8:46 AM vs ~2:15 PM)                                            | Compare with local time                             | Local time                     | ~5.5h off                       | Medium       |
| B21    | Break Mgmt             | Lunch break window 1:00-1:45 PM not enforced; break logged 3:53 PM                                       | Check My Breaks Today                               | Blocked outside window         | Logged Completed                | Medium       |
| B22    | WFH                    | Reject dialog shows raw ISO timestamps and a day earlier than list (Nov 9 vs Nov 10)                     | Create WFH, click Reject                            | Formatted correct date         | Raw UTC value                   | Medium       |
| B12    | Any unknown URL        | No 404 page; Dashboard loads                                                                             | Open /doesnotexist                                  | 404 page                       | Dashboard shown                 | Low          |
| B13    | Roles                  | Underscore blocked in role name (letters, numbers, spaces only)                                          | Save role QA_TEST_Role                              | Rule stated up front           | Rejected via toast              | Low          |
| B14    | All forms              | Errors are generic, short-lived toasts, not inline                                                       | Submit empty forms                                  | Inline field errors            | 2-second toast                  | Low          |
| B15    | Expense modal / global | Install banner covers Save/Submit buttons                                                                | Open New Expense Claim                              | Buttons visible                | Covered until dismissed         | Low          |
| B16    | Directory              | Everyone "Engineering", "Reports To: Self", raw role_staff                                               | Open directory                                      | Real data, clean labels        | Placeholder data                | Low          |
| B17    | Dashboard              | Org profile shows TaskFlow Technologies / info@taskflow.com                                              | Open dashboard                                      | Padhya branding                | Wrong branding                  | Low          |
| B18    | IT Assets              | Assignees Amit Sharma, Priya Patel not in Staff list                                                     | Open assets                                         | Existing staff                 | Demo data                       | Low          |
| B19    | Staff                  | Placeholder phone 9999999999; Super Admin has none                                                       | Open Staff                                          | Real phones                    | Placeholders                    | Low          |
| B23    | Client Invoicing       | Currency \$ while app uses INR                                                                           | Open page                                           | Consistent currency            | \$ shown                        | Low          |
| B24    | Permission             | Total changed 21 to 30 without my changes (unverified)                                                   | Reload page over time                               | Stable count                   | Count changed                   | Low          |
| B25    | Attendance edit        | No clock-in/out fields in edit form                                                                      | Click edit                                          | Time fields                    | Only status/mode/notes          | Low          |
| B26    | WFH                    | Admin can approve/reject own request; requester cannot cancel/delete                                     | Create WFH as admin                                 | Segregation; cancel            | Self-approve; no cancel         | Low          |

# 4. Validation issues

- Holidays: name required, spaces rejected, HTML/emoji safe. Past dates accepted; no inline errors.

- Roles: name required; max 50 chars enforced; underscore rejected. Duplicate-name check not tested.

- Notices: title and content required; HTML/script shown as plain text; Target Department is free text, not a dropdown.

- Tickets: title/description required, spaces rejected; no max length; Item Type independent of Category.

- Assets: tag and name required; negative cost accepted.

- Expenses: category required; negative amount leaves total at 0.00.

- WFH: all fields required; end date before start rejected (400); rejection reason required; double-click makes one record.

- Not tested: phone, email, file upload, salary, date-range logic in Leave.

# 5. Responsive issues

Not tested. The browser viewport could not be resized in this environment (stayed 1534px), so no results exist for 375, 768, 1366 or 1920px.

# 6. Console and network errors

- HTTP 500 on client billing report (B20); logged as "Error loading client billing report".

- Debug logs ("State changed", "Projects loaded") print on every page in production.

- socket.io requests to task-flow-backend-jiwe.onrender.com stay pending; realtime features may not work.

- No other 4xx/5xx responses on pages visited.

# 7. Security and access control

- No XSS found: \<b\>, \<script\>, \<img onerror\> were escaped in notices, tickets, assets, holidays.

- Untested: logout then Back, unauthenticated URL access, Employee-role access to admin pages, session after refresh.

- Notice deletes are instant; admin can approve own WFH request.

# 8. Suggestions

- Add Edit/Delete to Holidays, Notices, Tickets, Assets; add WFH cancel.

- Use one confirmation style for all deletes.

- Show real error states when an API fails; use inline field errors.

- Fix timezone/date formatting; enforce break windows; derive hours from real clock times.

- Standardise currency; remove demo data and production debug logs; add a 404 page; make install banner non-blocking.

# 9. QA records still in the system

| **Record**                                      | **Module** | **Reason it remains** |
|-------------------------------------------------|------------|-----------------------|
| QA_TEST_Dup holiday (1 Jan 2020)                | Holidays   | Hidden by 2026 filter |
| QA_TEST_BBBB... ticket TCK-20261026-1564        | Tickets    | No delete in UI       |
| QA_TEST_A1 asset                                | IT Assets  | No delete in UI       |
| QA_TEST\_ reason WFH request (Nov 10, Rejected) | WFH        | No delete in UI       |

Deleted and confirmed gone: QA holiday, QA role ("QA TEST Role Edited"), QA announcement, Super Admin attendance entry.

# Not tested

Responsive widths; login/auth and Employee-role tests; Leave forms; Staff Add/Edit/Delete (creates accounts); Expense claim saving; Payroll; Chat sending; exports; file uploads.
