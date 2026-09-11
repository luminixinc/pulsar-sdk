# PSL recipes

Sources: wiki "Custom Buttons", "After Sync Trigger", "Before Sync Trigger", "PSL Execution
Triggers", "Pulsar Settings Language - Overview" (verified 2026-07-03) and "Sending Debug Logs
with an After Sync Trigger"
(<https://luminix.atlassian.net/wiki/spaces/PD/pages/4074668537/Sending+Debug+Logs+with+an+After+Sync+Trigger>,
retrieved 2026-07-03). PSL blocks below are verbatim or verbatim-adjacent from the wiki (typos
fixed where flagged). After changing any Pulsar Setting, users must sync (or Refresh Settings)
before the change takes effect on device.

## Recipe: custom buttons end-to-end

Goal: buttons on the Event record-detail toolbar. Three settings (all required), plus options:

1. **Enable** — Key `pulsar.detail.custombuttons.show`, Value `TRUE`.
2. **Declare the buttons** — Key
   `pulsar.<Object API Name>[.<Record Type Friendly Name or "default">].buttons`, Value: a
   newline-separated list of `button_Id:Label` pairs. *Verbatim*: "Labels can contain spaces,
   button id's cannot contain spaces."

   ```
   Key:   pulsar.Event.default.buttons
   Value: Start_Visit:Start Visit
          Display_Contact:Display Contact
          Create_Call_Record:Create Call Record
   ```

   (The wiki's example key is lowercase `pulsar.event.default.buttons` while its buttonActions
   keys use `Event` — case handling is undocumented, so use the exact Object API Name casing.)
3. **One PSL setting per button** — Key `pulsar.buttonActions.<Object API Name>.<button_id>`.

Button action, `pulsar.buttonActions.Event.Start_Visit` — checks a flag, then stamps time,
flag, and device location on the record (wiki "Custom Buttons"):

```
DEFAULT{
Action=SetVar;
VarName=Is_Started;
VarValue=Is_Started__c;
|
Action=SqlQuery;
QueryString=SELECT CASE WHEN '%%Is_Started%%' = 'TRUE' THEN 1 ELSE 0 END AS IsEventStarted;
QueryReturnFields=IsEventStarted;
QueryTest=%%IsEventStarted%%=1;
QueryTestTrue=EVENT_ALREADY_STARTED;
|
Action=SetField;
FieldType=TimeStamp;
FieldName=StartDateTime;
|
Action=SetField;
FieldType=General;
FieldName=Is_Started__c;
FieldValue=TRUE;
|
Action=SetLocation;
LocationType=DeviceLocation;
FieldName=Event_Location__c;
|
Action=Alert;
Message=Visit Has Been Started;
}

EVENT_ALREADY_STARTED{
Action=Alert;
Message=Visit has already started. You can only start the visit once;
}
```

Notes: checkbox values in the local DB are the strings `'TRUE'`/`'FALSE'` — hence the
`= 'TRUE'` comparison and `FieldValue=TRUE`. `SetField`/`SetLocation` auto-save the record,
which is why they belong in buttons only.

Create-a-related-record button, `pulsar.buttonActions.Event.Create_Call_Record` — creates one
Call Record per Event (dedup via SqlQuery), mapping fields from the current Event:

```
DEFAULT{
Action=SetVar;
VarName=Event_Id;
VarValue=Id;
|
Action=SqlQuery;
QueryString=Select COUNT () AS Count_Call_Records FROM Call_Record__c WHERE Related_Event__c = '%%Event_Id%%';
QueryReturnFields=Count_Call_Records;
QueryTest=%%Count_Call_Records%%>0;
QueryTestTrue=DISPLAY_MESSAGE;
|
Action=CreateAndMapFields;
ActionShouldComplete=TRUE;
ObjectType=Call_Record__c;
Related_Event__c=Id;
WhatId__c=WhatId;
WhoId__c=WhoId;
Subject__c=Subject;
Description__c=Description;
Start_Date_Time__c=StartDateTime;
End_Date_Time__c=EndDateTime;
}

DISPLAY_MESSAGE{
Action=Alert;
Message=You have already created a call record for this Event;
}
```

Options:

- **Icon**: attach a PNG to setting `pulsar.layout.<sobjectType>.customButtons.icon` (no
  value needed); default is a "…" horizontal ellipsis. iOS/Windows/Android.
- **Dynamic visibility**: setting
  `pulsar.<Object API Name>[.<Record Type Friendly Name or "default">].buttons.listitems` —
  PSL that "should result in a SetResult PSL Action that sets the result value to a string in
  the format expected by the … buttons setting" (*verbatim*). Wiki example pattern:

```
DEFAULT{
Action=SetVar;
VarName=ShowExtras;
VarValue=Show_Extras__c;
|
Action=SqlQuery;
QueryString=SELECT '%%ShowExtras%%' as BoolVal;
QueryReturnFields=BoolVal;
QueryTest='%%BoolVal%%'='TRUE';
QueryTestTrue=ALL_BUTTONS;
QueryTestFalse=BASE_BUTTONS;
}
ALL_BUTTONS{
Action=SetResult;
Result=Start_Visit:Start Visit Create_Call_Record:Create Call Record;
}
BASE_BUTTONS{
Action=SetResult;
Result=Start_Visit:Start Visit;
}
```

Note: `ShowExtras` must be set (here from a field via `SetVar`) before the query interpolates
it — the wiki original does the same with `ShowOriginalOrder`. Also, the buttons format is
newline-separated and labels may contain spaces; the wiki's inline example shows
space-separated pairs (likely a table-export artifact). If space-separated Results misparse,
emit newlines with the `\n` escape (e.g.
`Result=Start_Visit:Start Visit\nCreate_Call_Record:Create Call Record;`) — verify in a
sandbox.

## Recipe: launch a .pulsarapp from a custom button

PSL side (`pulsar.buttonActions.<Object>.<button_id>`): `SetVar` **before** `LaunchDocument`;
the document also automatically receives the current page's ObjectID and ObjectType.

```
DEFAULT{
Action=SetVar;
VarName=Mode;
VarValue="checkin";
|
Action=LaunchDocument;
DocumentId=069i0000001i3wP;
}
```

- `DocumentId` is the `.pulsarapp`'s Content Library document Id (read `selectedDocumentId`
  from the browser URL when viewing the document in Salesforce; 15- or 18-char accepted here).
- `LaunchDocument` is available for custom buttons, onSave, onDelete (launches AFTER the
  action), and onCreate (REPLACES the create UI). Other launch surfaces (home tab, doclist
  button, deep links) are covered by the `create-pulsarapp` and `pulsar-native-ui` skills.

Web-app side — read the parameters at startup:

```js
import { Pulsar } from './myapp/pulsar.js';

(async () => {
  try {
    const pulsar = new Pulsar();
    await pulsar.init();                                  // once per page load
    const params = new URLSearchParams(window.location.search);
    const objectId = params.get('ObjectID');              // always sent by LaunchDocument
    const objectType = params.get('ObjectType');
    const mode = params.get('Mode');                      // your SetVar variable
    if (objectId) {
      const [record] = await pulsar.read(objectType, { Id: objectId });
      render(record, mode);
    }
  } catch (err) {
    console.error('Startup failed:', err.message);
  }
})();
```

Parameter-name casing follows the wiki's prose (`ObjectID`, `ObjectType`); the URL encoding of
variable values is undocumented — avoid exotic characters in `SetVar` values you pass this way.

## Recipe: after-sync debug-log upload

Automatically capture sync failures and attach Pulsar's debug log to a Salesforce record so
admins can investigate "without requiring device access". Setting key:
`pulsar.sync.AfterSyncTrigger`. Verbatim PSL from "Sending Debug Logs with an After Sync
Trigger" (retrieved 2026-07-03) — the trigger branches on `@@LastSyncSuccess`:

```
DEFAULT{
Action=SetVar;
VarName=LastSync;
VarValue=@@LastSyncTime;
|
Action=SetVar;
VarName=CurrentUserId;
VarValue=@@CurrentUserId;
|
Action=SetVar;
VarName=AppVersion;
VarValue=@@AppVersion;
|
Action=SetVar;
VarName=LastSyncSuccess;
VarValue=@@LastSyncSuccess;
|
Action=SqlQuery;
QueryString=SELECT CASE WHEN '%%LastSyncSuccess%%' = 'TRUE' THEN 1 ELSE 0 END AS SyncSuccess;
QueryReturnFields=SyncSuccess;
QueryTest=%%SyncSuccess%%=1;
QueryTestTrue=UpdateUser;
QueryTestFalse=CreateError;
}

UpdateUser{
Action=SFUpdate;
ObjectType=User;
Id=%%CurrentUserId%%;
LastSuccessfulPulsarSync__c=%%LastSync%%;
}

CreateError{
Action=SFCreate;
ObjectType=Sync_Error__c;
AffectedUser=%%CurrentUserId%%;
AppVersion__c=%%AppVersion%%;
SyncFailureDateTime__c=%%LastSync%%;
AttachLogFile=TRUE;
}
```

- *Verbatim*: "The key setting is `AttachLogFile=TRUE` in the `SFCreate` action. This flag
  tells Pulsar to attach the sync debug log to the newly created record."
- *Verbatim* (data handling): "The example uses `SFCreate` to send the error record to
  Salesforce. This action writes directly to Salesforce and does not update the local Pulsar
  database." Local records/list views will NOT show these error records until a later sync.
- Adapt field API names to your org (the example's `AffectedUser` has no `__c` suffix —
  org-specific; a lookup to User is typical).

**Required Salesforce setup** (verbatim list):

- The custom error object must exist
- It must support file attachments
- All referenced fields must exist
- The object must be accessible to the user via permissions

Also (wiki "Sync Triggers", critical): every object the trigger touches — here `User` and
`Sync_Error__c` — must be in the synced object list so its schema exists on device; keep
record data off the device with an `Id = null` sync filter if users don't need the records.

**Testing** (verbatim-adjacent): "Force a sync failure (invalid data or blocked network), then
confirm the error record and attached log appear in Salesforce."

## Recipe: before-sync gate (cancel a pending sync)

Setting key: `pulsar.sync.beforeSyncTrigger`. Ending with `SetResult; Result=FALSE;` cancels
the sync; `Result=TRUE` or no result lets it proceed. Wiki example — let the user cancel when
the last sync's network speeds were poor (`BranchChoice` must be the block's last action):

```
DEFAULT{
Action=SetVar;
VarName=LastSyncUploadSpeed;
VarValue=@@LastSyncUploadSpeed;
|
Action=SetVar;
VarName=LastSyncDownloadSpeed;
VarValue=@@LastSyncDownloadSpeed;
|
Action=SqlQuery;
QueryString=Select %%LastSyncDownloadSpeed%% > 0.0 AS ShouldProceed;
QueryReturnFields=ShouldProceed;
QueryTest=%%ShouldProceed%%=1;
QueryTestFalse=GoOn;
|
Action=Alert;
AlertType=BranchChoice;
Title=Before Sync Alert;
Message=Last sync download speed: %%LastSyncDownloadSpeed%%
Last sync upload speed: %%LastSyncUploadSpeed%%
Continue Syncing?;
YesButtonTitle=Continue;
NoButtonTitle=Cancel Sync;
YesButtonAction=GoOn;
NoButtonAction=EndItHere;
}
GoOn{
Action=SetResult;
Result=TRUE;
}
EndItHere{
Action=SetResult;
Result=FALSE;
}
```

Notes: the `QueryTestFalse=GoOn` guard skips the prompt when speed is `0.0` ("may be that the
user has not synced at all yet"). This trigger also cancels syncs a web app starts via
`pulsar.syncData()` — the app's `syncDataFinished` handler is your only signal (see
`pulsar-sync`); no PSL-veto error reaches the promise.

## Recipe: afterLogin sync-health alert

Setting key: `pulsar.afterLogin` (no object segment). Wiki example — tell the user whether the
last sync succeeded, right after sign-in:

```
DEFAULT{
Action=SetVar;
VarName=X;
VarValue=@@LastSyncSuccess;
|
Action=SqlQuery;
QueryString=select case when '%%X%%' = 'TRUE' then 1 else 0 end as Success;
QueryReturnFields=Success;
QueryTest=%%Success%%==1;
QueryTestTrue=Success;
|
Action=Alert;
Message=Your last sync failed, please try to sync again. If this continues, please contact your administrator;
}

Success{
Action=Alert;
Message=Last sync was successful!;
}
```

(The wiki names the branch block `Success` in mixed case despite its own ALL-CAPS block-name
rule — prefer ALL-CAPS names in new PSL.)

## Recipe: onSave roll-up (SqlQuery UPDATE)

Setting key: `pulsar.onSave.Order_Line_Item__c`. Recalculates a parent total whenever a line
item is saved. Straight quotes restored — the wiki original uses curly quotes that break the
SQL:

```
DEFAULT{
Action=SetVar;
VarName=Order_Id;
VarValue=Order__c;
|
Action=SqlQuery;
QueryString=Select SUM ( CAST( Amount__c AS REAL ) ) AS SUM_ORDER_AMOUNT FROM Order_Line_Item__c WHERE Order__c = '%%Order_Id%%';
QueryReturnFields=SUM_ORDER_AMOUNT;
|
Action=SqlQuery;
QueryString=Update Order__c SET Sub_Total__c = '%%SUM_ORDER_AMOUNT%%' WHERE Id = '%%Order_Id%%';
}
```

- The UPDATE commits to the local DB and "will be pushed to the server upon the next sync" —
  but it bypasses validation rules, formula recalculation, and roll-up recalculation (full
  SqlQuery caveat in `psl-language-reference.md`). Test in a sandbox.
- `CAST(… AS REAL)` is needed because every local value is stored as a string.
- This trigger also fires when a web app saves an Order Line Item via `pulsar.create()` /
  `pulsar.update()` — budget for trigger latency in save flows and don't double-compute the
  same roll-up in JS.
