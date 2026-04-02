/**
 * Validates Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica)
 * CNPJ format: XX.XXX.XXX/XXXX-XX (14 digits)
 */
export function validateCNPJ(cnpj: string): boolean {
  // Remove all non-digit characters
  const cleanCNPJ = cnpj.replace(/[^\d]/g, '');
  
  // Check if has exactly 14 digits
  if (cleanCNPJ.length !== 14) {
    return false;
  }
  
  // Check if all digits are the same (invalid CNPJs)
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) {
    return false;
  }
  
  // Validate first check digit
  let sum = 0;
  let weight = 5;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  let checkDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (checkDigit !== parseInt(cleanCNPJ.charAt(12))) {
    return false;
  }
  
  // Validate second check digit
  sum = 0;
  weight = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weight;
    weight = weight === 2 ? 9 : weight - 1;
  }
  checkDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (checkDigit !== parseInt(cleanCNPJ.charAt(13))) {
    return false;
  }
  
  return true;
}

/**
 * Validates Brazilian CRM (Conselho Regional de Medicina)
 * CRM format: varies by state, but typically 4-7 digits + state code
 */
export function validateCRM(crm: string): boolean {
  // Remove all non-alphanumeric characters
  const cleanCRM = crm.replace(/[^A-Za-z0-9]/g, '');
  
  // CRM should have at least 4 digits and optionally a state code (2 letters)
  // Minimum length: 4 (digits only) or 6 (with state code)
  if (cleanCRM.length < 4 || cleanCRM.length > 9) {
    return false;
  }
  
  // Should contain at least some digits
  if (!/\d/.test(cleanCRM)) {
    return false;
  }
  
  return true;
}

/**
 * Validates Brazilian phone number
 * Formats: (XX) XXXX-XXXX or (XX) XXXXX-XXXX
 */
export function validatePhone(phone: string): boolean {
  // Remove all non-digit characters
  const cleanPhone = phone.replace(/[^\d]/g, '');
  
  // Brazilian phones: 10 digits (landline) or 11 digits (mobile with 9)
  return cleanPhone.length === 10 || cleanPhone.length === 11;
}

/**
 * Validates Brazilian CPF (Cadastro de Pessoas Físicas)
 * CPF format: XXX.XXX.XXX-XX (11 digits)
 */
export function validateCPF(cpf: string): boolean {
  // Remove all non-digit characters
  const cleanCPF = cpf.replace(/[^\d]/g, '');
  
  // Check if has exactly 11 digits
  if (cleanCPF.length !== 11) {
    return false;
  }
  
  // Check if all digits are the same (invalid CPFs)
  if (/^(\d)\1{10}$/.test(cleanCPF)) {
    return false;
  }
  
  // Validate first check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let checkDigit = 11 - (sum % 11);
  if (checkDigit === 10 || checkDigit === 11) checkDigit = 0;
  if (checkDigit !== parseInt(cleanCPF.charAt(9))) {
    return false;
  }
  
  // Validate second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  checkDigit = 11 - (sum % 11);
  if (checkDigit === 10 || checkDigit === 11) checkDigit = 0;
  if (checkDigit !== parseInt(cleanCPF.charAt(10))) {
    return false;
  }
  
  return true;
}
