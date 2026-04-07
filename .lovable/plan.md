

# Fix Build Errors and Publish

There are 6 TypeScript build errors caused by Supabase's strict typing (`RejectExcessProperties`) rejecting `Record<string, any>` types. These must be fixed before publishing.

## Root Cause

Supabase's generated types now enforce that `.update()` and `.insert()` calls only accept objects with known column names. Using `Record<string, string>` or `Record<string, any>` bypasses this and causes errors.

## Fix Strategy

Cast the dynamic objects to `any` at the call site. This is the minimal, safe fix since the fields are already validated by the application logic.

### Files to fix (6 errors):

1. **`src/components/contratos/ConsolidarContratoDialog.tsx`** (line 219) — cast update payload to `any`
2. **`src/components/contratos/VincularContratoExistenteDialog.tsx`** (line 132) — cast update payload to `any`
3. **`src/components/medicos/ImportMonitorTab.tsx`** (line 330) — cast upsert payload to `any`
4. **`src/components/medicos/LeadBulkEditDialog.tsx`** (line 208) — cast update payload to `any`
5. **`src/components/radiologia/AbaHistoricoImportacoes.tsx`** (line 114) — cast insert payload to `any`
6. **`src/hooks/useFinanceiroData.ts`** (line 327) — cast insert payload to `any`

Each fix is a single `as any` cast on the dynamic object being passed to `.update()`, `.insert()`, or `.upsert()`.

After fixing, the app will build successfully and can be published.

