/**
 * Error handler utility for converting database errors to user-friendly messages
 * Prevents disclosure of internal database details
 */

interface DatabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * Converts Supabase/PostgreSQL error codes to user-friendly messages
 */
export function getUserFriendlyError(error: DatabaseError | any): string {
  // Handle null/undefined
  if (!error) {
    return 'Ocorreu um erro inesperado. Tente novamente.';
  }

  // Common PostgreSQL error codes
  const errorCode = error.code || error.error_code;
  
  switch (errorCode) {
    // Permission denied
    case '42501':
      return 'Você não tem permissão para realizar esta ação.';
    
    // Unique violation
    case '23505':
      return 'Este registro já existe no sistema.';
    
    // Foreign key violation
    case '23503':
      return 'Não é possível completar esta ação devido a dados relacionados.';
    
    // Not null violation
    case '23502':
      return 'Campos obrigatórios não foram preenchidos.';
    
    // Check constraint violation
    case '23514':
      return 'Os dados fornecidos não atendem aos requisitos.';
    
    // Invalid text representation
    case '22P02':
      return 'Formato de dados inválido.';
    
    // RLS policy violation (custom pattern detection)
    default:
      if (error.message && error.message.includes('row-level security')) {
        return 'Você não tem permissão para acessar estes dados.';
      }
      
      if (error.message && error.message.includes('duplicate key')) {
        return 'Este registro já existe no sistema.';
      }
      
      if (error.message && error.message.includes('permission denied')) {
        return 'Você não tem permissão para realizar esta ação.';
      }
      
      // Generic fallback - don't expose internal details
      return 'Ocorreu um erro ao processar sua solicitação. Tente novamente ou contate o suporte.';
  }
}

/**
 * Logs error details for debugging while showing safe message to user
 */
export function handleError(error: any, context?: string): string {
  // Log full error for debugging (console only, not in production UI)
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error('Error:', error);
  }
  
  return getUserFriendlyError(error);
}
