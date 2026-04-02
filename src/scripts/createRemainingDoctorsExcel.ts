import * as XLSX from 'xlsx';

// Médicos do 49 em diante
const remainingDoctors = [
  // 49-58
  { nome: "Cassio Cunha Lima", crm: "18825", especialidade: "Cardiologia", email: "cassio.lima@example.com", telefone: "(48) 98765-4321", cpf: "123.456.789-49", dataNascimento: "1978-05-10", estado: "SC", rqe: "12349", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Cecilia Santos Costa", crm: "19876", especialidade: "Pediatria", email: "cecilia.costa@example.com", telefone: "(48) 98765-4322", cpf: "123.456.789-50", dataNascimento: "1982-08-22", estado: "SC", rqe: "12350", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Charles Medeiros Neto", crm: "20987", especialidade: "Ortopedia", email: "charles.neto@example.com", telefone: "(48) 98765-4323", cpf: "123.456.789-51", dataNascimento: "1975-11-30", estado: "SC", rqe: "12351", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Cintia Rodrigues Silva", crm: "21098", especialidade: "Dermatologia", email: "cintia.silva@example.com", telefone: "(48) 98765-4324", cpf: "123.456.789-52", dataNascimento: "1988-02-14", estado: "SC", rqe: "12352", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Clarice Oliveira Souza", crm: "22109", especialidade: "Ginecologia", email: "clarice.souza@example.com", telefone: "(48) 98765-4325", cpf: "123.456.789-53", dataNascimento: "1981-06-18", estado: "SC", rqe: "12353", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Claudia Almeida Santos", crm: "23210", especialidade: "Psiquiatria", email: "claudia.santos@example.com", telefone: "(48) 98765-4326", cpf: "123.456.789-54", dataNascimento: "1979-09-25", estado: "SC", rqe: "12354", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Claudio Ferreira Lima", crm: "24321", especialidade: "Urologia", email: "claudio.lima@example.com", telefone: "(48) 98765-4327", cpf: "123.456.789-55", dataNascimento: "1976-12-08", estado: "SC", rqe: "12355", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Cristiane Souza Costa", crm: "25432", especialidade: "Endocrinologia", email: "cristiane.costa@example.com", telefone: "(48) 98765-4328", cpf: "123.456.789-56", dataNascimento: "1983-03-12", estado: "SC", rqe: "12356", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Cristiano Silva Neto", crm: "26543", especialidade: "Neurologia", email: "cristiano.neto@example.com", telefone: "(48) 98765-4329", cpf: "123.456.789-57", dataNascimento: "1980-07-20", estado: "SC", rqe: "12357", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Daiane Rodrigues Souza", crm: "27654", especialidade: "Oftalmologia", email: "daiane.souza@example.com", telefone: "(48) 98765-4330", cpf: "123.456.789-58", dataNascimento: "1987-10-05", estado: "SC", rqe: "12358", statusMedico: "Ativo", statusContrato: "Ativo" },
  
  // 59-68
  { nome: "Daniel Costa Lima", crm: "28765", especialidade: "Otorrinolaringologia", email: "daniel.lima@example.com", telefone: "(48) 98765-4331", cpf: "123.456.789-59", dataNascimento: "1984-01-15", estado: "SC", rqe: "12359", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Daniela Almeida Silva", crm: "29876", especialidade: "Reumatologia", email: "daniela.silva@example.com", telefone: "(48) 98765-4332", cpf: "123.456.789-60", dataNascimento: "1981-04-28", estado: "SC", rqe: "12360", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Danilo Ferreira Costa", crm: "30987", especialidade: "Cardiologia", email: "danilo.costa@example.com", telefone: "(48) 98765-4333", cpf: "123.456.789-61", dataNascimento: "1978-08-10", estado: "SC", rqe: "12361", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Debora Santos Souza", crm: "31098", especialidade: "Pediatria", email: "debora.souza@example.com", telefone: "(48) 98765-4334", cpf: "123.456.789-62", dataNascimento: "1985-11-22", estado: "SC", rqe: "12362", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Diego Silva Neto", crm: "32109", especialidade: "Ortopedia", email: "diego.neto@example.com", telefone: "(48) 98765-4335", cpf: "123.456.789-63", dataNascimento: "1982-02-14", estado: "SC", rqe: "12363", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Edson Rodrigues Lima", crm: "33210", especialidade: "Dermatologia", email: "edson.lima@example.com", telefone: "(48) 98765-4336", cpf: "123.456.789-64", dataNascimento: "1979-06-18", estado: "SC", rqe: "12364", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Eduardo Costa Silva", crm: "34321", especialidade: "Ginecologia", email: "eduardo.silva@example.com", telefone: "(48) 98765-4337", cpf: "123.456.789-65", dataNascimento: "1976-09-25", estado: "SC", rqe: "12365", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Elaine Almeida Souza", crm: "35432", especialidade: "Psiquiatria", email: "elaine.souza@example.com", telefone: "(48) 98765-4338", cpf: "123.456.789-66", dataNascimento: "1983-12-08", estado: "SC", rqe: "12366", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Eliana Ferreira Costa", crm: "36543", especialidade: "Urologia", email: "eliana.costa@example.com", telefone: "(48) 98765-4339", cpf: "123.456.789-67", dataNascimento: "1980-03-12", estado: "SC", rqe: "12367", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Elisangela Santos Lima", crm: "37654", especialidade: "Endocrinologia", email: "elisangela.lima@example.com", telefone: "(48) 98765-4340", cpf: "123.456.789-68", dataNascimento: "1987-07-20", estado: "SC", rqe: "12368", statusMedico: "Ativo", statusContrato: "Ativo" },
  
  // 69-78
  { nome: "Erica Silva Neto", crm: "38765", especialidade: "Neurologia", email: "erica.neto@example.com", telefone: "(48) 98765-4341", cpf: "123.456.789-69", dataNascimento: "1984-10-05", estado: "SC", rqe: "12369", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Fabiana Rodrigues Costa", crm: "39876", especialidade: "Oftalmologia", email: "fabiana.costa@example.com", telefone: "(48) 98765-4342", cpf: "123.456.789-70", dataNascimento: "1981-01-15", estado: "SC", rqe: "12370", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Fabio Almeida Souza", crm: "40987", especialidade: "Otorrinolaringologia", email: "fabio.souza@example.com", telefone: "(48) 98765-4343", cpf: "123.456.789-71", dataNascimento: "1978-04-28", estado: "SC", rqe: "12371", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Fabricio Costa Lima", crm: "41098", especialidade: "Reumatologia", email: "fabricio.lima@example.com", telefone: "(48) 98765-4344", cpf: "123.456.789-72", dataNascimento: "1985-08-10", estado: "SC", rqe: "12372", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Felipe Ferreira Silva", crm: "42109", especialidade: "Cardiologia", email: "felipe.silva@example.com", telefone: "(48) 98765-4345", cpf: "123.456.789-73", dataNascimento: "1982-11-22", estado: "SC", rqe: "12373", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Fernanda Santos Costa", crm: "43210", especialidade: "Pediatria", email: "fernanda.costa@example.com", telefone: "(48) 98765-4346", cpf: "123.456.789-74", dataNascimento: "1979-02-14", estado: "SC", rqe: "12374", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Fernando Silva Neto", crm: "44321", especialidade: "Ortopedia", email: "fernando.neto@example.com", telefone: "(48) 98765-4347", cpf: "123.456.789-75", dataNascimento: "1976-06-18", estado: "SC", rqe: "12375", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Flavia Rodrigues Lima", crm: "45432", especialidade: "Dermatologia", email: "flavia.lima@example.com", telefone: "(48) 98765-4348", cpf: "123.456.789-76", dataNascimento: "1983-09-25", estado: "SC", rqe: "12376", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Franciele Almeida Souza", crm: "46543", especialidade: "Ginecologia", email: "franciele.souza@example.com", telefone: "(48) 98765-4349", cpf: "123.456.789-77", dataNascimento: "1980-12-08", estado: "SC", rqe: "12377", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Gabriela Costa Silva", crm: "47654", especialidade: "Psiquiatria", email: "gabriela.silva@example.com", telefone: "(48) 98765-4350", cpf: "123.456.789-78", dataNascimento: "1987-03-12", estado: "SC", rqe: "12378", statusMedico: "Ativo", statusContrato: "Ativo" },
  
  // 79-88
  { nome: "Giovana Ferreira Costa", crm: "48765", especialidade: "Urologia", email: "giovana.costa@example.com", telefone: "(48) 98765-4351", cpf: "123.456.789-79", dataNascimento: "1984-07-20", estado: "SC", rqe: "12379", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Guilherme Santos Lima", crm: "49876", especialidade: "Endocrinologia", email: "guilherme.lima@example.com", telefone: "(48) 98765-4352", cpf: "123.456.789-80", dataNascimento: "1981-10-05", estado: "SC", rqe: "12380", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Gustavo Silva Neto", crm: "50987", especialidade: "Neurologia", email: "gustavo.neto@example.com", telefone: "(48) 98765-4353", cpf: "123.456.789-81", dataNascimento: "1978-01-15", estado: "SC", rqe: "12381", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Helena Rodrigues Costa", crm: "51098", especialidade: "Oftalmologia", email: "helena.costa@example.com", telefone: "(48) 98765-4354", cpf: "123.456.789-82", dataNascimento: "1985-04-28", estado: "SC", rqe: "12382", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Heloisa Almeida Souza", crm: "52109", especialidade: "Otorrinolaringologia", email: "heloisa.souza@example.com", telefone: "(48) 98765-4355", cpf: "123.456.789-83", dataNascimento: "1982-08-10", estado: "SC", rqe: "12383", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Henrique Costa Lima", crm: "53210", especialidade: "Reumatologia", email: "henrique.lima@example.com", telefone: "(48) 98765-4356", cpf: "123.456.789-84", dataNascimento: "1979-11-22", estado: "SC", rqe: "12384", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Igor Ferreira Silva", crm: "54321", especialidade: "Cardiologia", email: "igor.silva@example.com", telefone: "(48) 98765-4357", cpf: "123.456.789-85", dataNascimento: "1976-02-14", estado: "SC", rqe: "12385", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Ingrid Santos Costa", crm: "55432", especialidade: "Pediatria", email: "ingrid.costa@example.com", telefone: "(48) 98765-4358", cpf: "123.456.789-86", dataNascimento: "1983-06-18", estado: "SC", rqe: "12386", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Isabel Silva Neto", crm: "56543", especialidade: "Ortopedia", email: "isabel.neto@example.com", telefone: "(48) 98765-4359", cpf: "123.456.789-87", dataNascimento: "1980-09-25", estado: "SC", rqe: "12387", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Ivan Rodrigues Lima", crm: "57654", especialidade: "Dermatologia", email: "ivan.lima@example.com", telefone: "(48) 98765-4360", cpf: "123.456.789-88", dataNascimento: "1987-12-08", estado: "SC", rqe: "12388", statusMedico: "Ativo", statusContrato: "Ativo" },
  
  // 89-98
  { nome: "Jaqueline Almeida Souza", crm: "58765", especialidade: "Ginecologia", email: "jaqueline.souza@example.com", telefone: "(48) 98765-4361", cpf: "123.456.789-89", dataNascimento: "1984-03-12", estado: "SC", rqe: "12389", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Joao Costa Silva", crm: "59876", especialidade: "Psiquiatria", email: "joao.silva@example.com", telefone: "(48) 98765-4362", cpf: "123.456.789-90", dataNascimento: "1981-07-20", estado: "SC", rqe: "12390", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Jorge Ferreira Costa", crm: "60987", especialidade: "Urologia", email: "jorge.costa@example.com", telefone: "(48) 98765-4363", cpf: "123.456.789-91", dataNascimento: "1978-10-05", estado: "SC", rqe: "12391", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Jose Santos Lima", crm: "61098", especialidade: "Endocrinologia", email: "jose.lima@example.com", telefone: "(48) 98765-4364", cpf: "123.456.789-92", dataNascimento: "1985-01-15", estado: "SC", rqe: "12392", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Juliana Silva Neto", crm: "62109", especialidade: "Neurologia", email: "juliana.neto@example.com", telefone: "(48) 98765-4365", cpf: "123.456.789-93", dataNascimento: "1982-04-28", estado: "SC", rqe: "12393", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Julio Rodrigues Costa", crm: "63210", especialidade: "Oftalmologia", email: "julio.costa@example.com", telefone: "(48) 98765-4366", cpf: "123.456.789-94", dataNascimento: "1979-08-10", estado: "SC", rqe: "12394", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Karen Almeida Souza", crm: "64321", especialidade: "Otorrinolaringologia", email: "karen.souza@example.com", telefone: "(48) 98765-4367", cpf: "123.456.789-95", dataNascimento: "1976-11-22", estado: "SC", rqe: "12395", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Katia Costa Lima", crm: "65432", especialidade: "Reumatologia", email: "katia.lima@example.com", telefone: "(48) 98765-4368", cpf: "123.456.789-96", dataNascimento: "1983-02-14", estado: "SC", rqe: "12396", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Kelly Ferreira Silva", crm: "66543", especialidade: "Cardiologia", email: "kelly.silva@example.com", telefone: "(48) 98765-4369", cpf: "123.456.789-97", dataNascimento: "1980-06-18", estado: "SC", rqe: "12397", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Leonardo Santos Costa", crm: "67654", especialidade: "Pediatria", email: "leonardo.costa@example.com", telefone: "(48) 98765-4370", cpf: "123.456.789-98", dataNascimento: "1987-09-25", estado: "SC", rqe: "12398", statusMedico: "Ativo", statusContrato: "Ativo" },
  
  // 99-100
  { nome: "Leticia Silva Neto", crm: "68765", especialidade: "Ortopedia", email: "leticia.neto@example.com", telefone: "(48) 98765-4371", cpf: "123.456.789-99", dataNascimento: "1984-12-08", estado: "SC", rqe: "12399", statusMedico: "Ativo", statusContrato: "Ativo" },
  { nome: "Lucas Rodrigues Lima", crm: "69876", especialidade: "Dermatologia", email: "lucas.lima@example.com", telefone: "(48) 98765-4372", cpf: "123.456.790-00", dataNascimento: "1981-03-12", estado: "SC", rqe: "12400", statusMedico: "Ativo", statusContrato: "Ativo" }
];

// Criar worksheet
const ws = XLSX.utils.json_to_sheet(remainingDoctors.map(doc => ({
  'Nome Completo': doc.nome,
  'CRM': doc.crm,
  'Especialidade': doc.especialidade,
  'RQE': doc.rqe,
  'Email': doc.email,
  'Telefone': doc.telefone,
  'CPF': doc.cpf,
  'Data de Nascimento': doc.dataNascimento,
  'Estado': doc.estado,
  'Status do Médico': doc.statusMedico,
  'Status do Contrato': doc.statusContrato
})));

// Criar workbook
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Médicos');

// Escrever arquivo
XLSX.writeFile(wb, 'medicos_restantes.xlsx');

console.log('Arquivo Excel criado com sucesso: medicos_restantes.xlsx');
console.log(`Total de médicos no arquivo: ${remainingDoctors.length}`);
