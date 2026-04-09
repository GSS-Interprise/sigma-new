

# Fix PDF Duplication in sync-effect-licitacoes

## Problem
Line 274 appends `_${Date.now()}` to every filename, making each sync create a new file even if one already exists for that licitação.

## Fix
Before downloading/uploading the PDF, list existing files in the `editais-pdfs/{licitacaoId}/` folder. Extract the base name (código without timestamp) and check if any existing file starts with that base. If yes, skip the upload.

## Changes

### `supabase/functions/sync-effect-licitacoes/index.ts`
Replace the PDF upload block (lines 263-306) with:

1. Compute the base name: `const baseFileName = favorito.codigo.replace(/[^a-zA-Z0-9]/g, '_');`
2. List existing files: `supabase.storage.from('editais-pdfs').list(licitacaoId)`
3. Check if any file starts with `baseFileName`: `existingFiles.some(f => f.name.startsWith(baseFileName))`
4. If match found → skip upload, log "PDF já existe"
5. If no match → proceed with upload using the timestamped filename (existing retry logic preserved)

This is a single-file change in the edge function. Deploy will be automatic.

