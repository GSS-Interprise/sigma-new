export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ages_clientes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          contato_principal: string | null
          created_at: string
          email_contato: string | null
          endereco: string | null
          especialidade_cliente: string | null
          id: string
          nome_empresa: string
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string | null
          status_cliente: string
          telefone_contato: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          contato_principal?: string | null
          created_at?: string
          email_contato?: string | null
          endereco?: string | null
          especialidade_cliente?: string | null
          id?: string
          nome_empresa: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string | null
          status_cliente?: string
          telefone_contato?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          contato_principal?: string | null
          created_at?: string
          email_contato?: string | null
          endereco?: string | null
          especialidade_cliente?: string | null
          id?: string
          nome_empresa?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string | null
          status_cliente?: string
          telefone_contato?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ages_contrato_aditivos: {
        Row: {
          contrato_id: string
          created_at: string
          data_inicio: string
          data_termino: string
          id: string
          observacoes: string | null
          prazo_meses: number
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_inicio: string
          data_termino: string
          id?: string
          observacoes?: string | null
          prazo_meses: number
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_inicio?: string
          data_termino?: string
          id?: string
          observacoes?: string | null
          prazo_meses?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ages_contrato_aditivos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "ages_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_contrato_itens: {
        Row: {
          contrato_id: string
          created_at: string
          id: string
          item: string
          quantidade: number | null
          updated_at: string
          valor_item: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          id?: string
          item: string
          quantidade?: number | null
          updated_at?: string
          valor_item: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          id?: string
          item?: string
          quantidade?: number | null
          updated_at?: string
          valor_item?: number
        }
        Relationships: [
          {
            foreignKeyName: "ages_contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "ages_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_contrato_renovacoes: {
        Row: {
          contrato_id: string
          created_at: string
          data_vigencia: string
          id: string
          percentual_reajuste: number | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_vigencia: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_vigencia?: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_contrato_renovacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "ages_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_contratos: {
        Row: {
          ages_cliente_id: string | null
          ages_unidade_id: string | null
          assinado: string | null
          carga_horaria_mensal: number | null
          cliente_id: string | null
          codigo_contrato: string | null
          codigo_interno: number | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          documento_url: string | null
          id: string
          motivo_pendente: string | null
          objeto_contrato: string | null
          observacoes: string | null
          prazo_meses: number | null
          profissional_id: string | null
          status: string
          tipo_contrato: string | null
          unidade_id: string | null
          updated_at: string
          valor_hora: number | null
          valor_mensal: number | null
        }
        Insert: {
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
          assinado?: string | null
          carga_horaria_mensal?: number | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          documento_url?: string | null
          id?: string
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          observacoes?: string | null
          prazo_meses?: number | null
          profissional_id?: string | null
          status?: string
          tipo_contrato?: string | null
          unidade_id?: string | null
          updated_at?: string
          valor_hora?: number | null
          valor_mensal?: number | null
        }
        Update: {
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
          assinado?: string | null
          carga_horaria_mensal?: number | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          documento_url?: string | null
          id?: string
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          observacoes?: string | null
          prazo_meses?: number | null
          profissional_id?: string | null
          status?: string
          tipo_contrato?: string | null
          unidade_id?: string | null
          updated_at?: string
          valor_hora?: number | null
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_contratos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ages_contratos_ages_cliente"
            columns: ["ages_cliente_id"]
            isOneToOne: false
            referencedRelation: "ages_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ages_contratos_ages_unidade"
            columns: ["ages_unidade_id"]
            isOneToOne: false
            referencedRelation: "ages_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_contratos_documentos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          contrato_id: string
          created_at: string
          id: string
          observacoes: string | null
          tipo_documento: string
          uploaded_by: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          contrato_id: string
          created_at?: string
          id?: string
          observacoes?: string | null
          tipo_documento: string
          uploaded_by?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          contrato_id?: string
          created_at?: string
          id?: string
          observacoes?: string | null
          tipo_documento?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_contratos_documentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "ages_contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_lead_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          created_at: string
          id: string
          lead_id: string
          observacoes: string | null
          tipo_documento: string | null
          uploaded_by: string | null
          uploaded_by_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          created_at?: string
          id?: string
          lead_id: string
          observacoes?: string | null
          tipo_documento?: string | null
          uploaded_by?: string | null
          uploaded_by_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          created_at?: string
          id?: string
          lead_id?: string
          observacoes?: string | null
          tipo_documento?: string | null
          uploaded_by?: string | null
          uploaded_by_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_lead_anexos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ages_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_lead_historico: {
        Row: {
          campos_alterados: string[] | null
          criado_em: string
          dados_anteriores: Json | null
          dados_novos: Json | null
          descricao_resumida: string
          id: string
          lead_id: string
          tipo_evento: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          campos_alterados?: string[] | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao_resumida: string
          id?: string
          lead_id: string
          tipo_evento: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          campos_alterados?: string[] | null
          criado_em?: string
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          descricao_resumida?: string
          id?: string
          lead_id?: string
          tipo_evento?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ages_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_leads: {
        Row: {
          agencia: string | null
          arquivo_id: string | null
          banco: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          conta_corrente: string | null
          cpf: string | null
          created_at: string
          data_inicio_contrato: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          especificacoes_contrato: string | null
          id: string
          local_prestacao_servico: string | null
          modalidade_contrato: string | null
          nome: string
          observacoes: string | null
          origem: string | null
          profissao: string | null
          registro_profissional: string | null
          rg: string | null
          status: string
          telefone: string | null
          telefones_adicionais: string[] | null
          uf: string | null
          unidades_vinculadas: string[] | null
          updated_at: string
          valor_contrato: number | null
        }
        Insert: {
          agencia?: string | null
          arquivo_id?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          conta_corrente?: string | null
          cpf?: string | null
          created_at?: string
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          especificacoes_contrato?: string | null
          id?: string
          local_prestacao_servico?: string | null
          modalidade_contrato?: string | null
          nome: string
          observacoes?: string | null
          origem?: string | null
          profissao?: string | null
          registro_profissional?: string | null
          rg?: string | null
          status?: string
          telefone?: string | null
          telefones_adicionais?: string[] | null
          uf?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string
          valor_contrato?: number | null
        }
        Update: {
          agencia?: string | null
          arquivo_id?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          conta_corrente?: string | null
          cpf?: string | null
          created_at?: string
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          especificacoes_contrato?: string | null
          id?: string
          local_prestacao_servico?: string | null
          modalidade_contrato?: string | null
          nome?: string
          observacoes?: string | null
          origem?: string | null
          profissao?: string | null
          registro_profissional?: string | null
          rg?: string | null
          status?: string
          telefone?: string | null
          telefones_adicionais?: string[] | null
          uf?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string
          valor_contrato?: number | null
        }
        Relationships: []
      }
      ages_licitacoes: {
        Row: {
          created_at: string
          id: string
          licitacao_id: string | null
          observacoes: string | null
          prazo_licitacao: string | null
          prazo_retorno_gss: string | null
          responsavel_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          licitacao_id?: string | null
          observacoes?: string | null
          prazo_licitacao?: string | null
          prazo_retorno_gss?: string | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          licitacao_id?: string | null
          observacoes?: string | null
          prazo_licitacao?: string | null
          prazo_retorno_gss?: string | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ages_producao: {
        Row: {
          ano_referencia: number
          cliente_id: string | null
          conferido_em: string | null
          conferido_por: string | null
          created_at: string
          folha_ponto_url: string | null
          id: string
          mes_referencia: number
          observacoes: string | null
          profissional_id: string
          status_conferencia: string
          tipo_alocacao: string | null
          total_horas: number
          unidade_id: string | null
          updated_at: string
        }
        Insert: {
          ano_referencia: number
          cliente_id?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          folha_ponto_url?: string | null
          id?: string
          mes_referencia: number
          observacoes?: string | null
          profissional_id: string
          status_conferencia?: string
          tipo_alocacao?: string | null
          total_horas?: number
          unidade_id?: string | null
          updated_at?: string
        }
        Update: {
          ano_referencia?: number
          cliente_id?: string | null
          conferido_em?: string | null
          conferido_por?: string | null
          created_at?: string
          folha_ponto_url?: string | null
          id?: string
          mes_referencia?: number
          observacoes?: string | null
          profissional_id?: string
          status_conferencia?: string
          tipo_alocacao?: string | null
          total_horas?: number
          unidade_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ages_producao_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_profissionais: {
        Row: {
          agencia: string | null
          banco: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          conta_corrente: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          lead_origem_id: string | null
          nome: string
          observacoes: string | null
          profissao: string
          registro_profissional: string | null
          rg: string | null
          status: string
          telefone: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          conta_corrente?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          lead_origem_id?: string | null
          nome: string
          observacoes?: string | null
          profissao: string
          registro_profissional?: string | null
          rg?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          banco?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          conta_corrente?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          lead_origem_id?: string | null
          nome?: string
          observacoes?: string | null
          profissao?: string
          registro_profissional?: string | null
          rg?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ages_profissionais_documentos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          id: string
          observacoes: string | null
          profissional_id: string
          tipo_documento: string
          uploaded_by: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          observacoes?: string | null
          profissional_id: string
          tipo_documento: string
          uploaded_by?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          observacoes?: string | null
          profissional_id?: string
          tipo_documento?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_profissionais_documentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_propostas: {
        Row: {
          atualizado_em: string
          cliente_id: string | null
          contrato_id: string | null
          criado_em: string
          descricao: string | null
          id: string
          id_proposta: string | null
          lead_id: string
          observacoes: string | null
          profissional_id: string | null
          status: string
          unidade_id: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_id?: string | null
          contrato_id?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          id_proposta?: string | null
          lead_id: string
          observacoes?: string | null
          profissional_id?: string | null
          status?: string
          unidade_id?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string | null
          contrato_id?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          id_proposta?: string | null
          lead_id?: string
          observacoes?: string | null
          profissional_id?: string | null
          status?: string
          unidade_id?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "ages_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_propostas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "ages_contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_propostas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "ages_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_propostas_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_propostas_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "ages_unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_unidades: {
        Row: {
          cidade: string | null
          cliente_id: string
          codigo: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          uf: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cliente_id: string
          codigo?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cliente_id?: string
          codigo?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ages_unidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "ages_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      blacklist: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          nome: string | null
          origem: string | null
          phone_e164: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          nome?: string | null
          origem?: string | null
          phone_e164: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          nome?: string | null
          origem?: string | null
          phone_e164?: string
          reason?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cnpj: string
          contato_principal: string
          created_at: string | null
          email: string
          email_financeiro: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome_empresa: string
          nome_fantasia: string | null
          nome_unidade: string | null
          razao_social: string | null
          telefone: string
          telefone_financeiro: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj: string
          contato_principal: string
          created_at?: string | null
          email: string
          email_financeiro?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome_empresa: string
          nome_fantasia?: string | null
          nome_unidade?: string | null
          razao_social?: string | null
          telefone: string
          telefone_financeiro?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string
          contato_principal?: string
          created_at?: string | null
          email?: string
          email_financeiro?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome_empresa?: string
          nome_fantasia?: string | null
          nome_unidade?: string | null
          razao_social?: string | null
          telefone?: string
          telefone_financeiro?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      config_lista_items: {
        Row: {
          campo_nome: string
          created_at: string | null
          id: string
          valor: string
        }
        Insert: {
          campo_nome: string
          created_at?: string | null
          id?: string
          valor: string
        }
        Update: {
          campo_nome?: string
          created_at?: string | null
          id?: string
          valor?: string
        }
        Relationships: []
      }
      contrato_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          contrato_id: string
          created_at: string | null
          id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          contrato_id: string
          created_at?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          contrato_id?: string
          created_at?: string | null
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      contrato_itens: {
        Row: {
          contrato_demanda_id: string
          created_at: string | null
          descricao: string
          id: string
          quantidade: number | null
          valor_unitario: number | null
        }
        Insert: {
          contrato_demanda_id: string
          created_at?: string | null
          descricao: string
          id?: string
          quantidade?: number | null
          valor_unitario?: number | null
        }
        Update: {
          contrato_demanda_id?: string
          created_at?: string | null
          descricao?: string
          id?: string
          quantidade?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_itens_contrato_demanda_id_fkey"
            columns: ["contrato_demanda_id"]
            isOneToOne: false
            referencedRelation: "contratos_demanda"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_renovacoes: {
        Row: {
          contrato_id: string
          created_at: string | null
          data_vigencia: string
          id: string
          percentual_reajuste: number | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          data_vigencia: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          data_vigencia?: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: []
      }
      contratos: {
        Row: {
          assinado: string | null
          cliente_id: string | null
          codigo_interno: number | null
          condicao_pagamento: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          data_termino: string | null
          especialidade_contrato: string | null
          id: string
          medico_id: string | null
          motivo_pendente: string | null
          objeto_contrato: string | null
          prazo_meses: number | null
          status_contrato: string | null
          tipo_servico: string[] | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          data_termino?: string | null
          especialidade_contrato?: string | null
          id?: string
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_servico?: string[] | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          data_termino?: string | null
          especialidade_contrato?: string | null
          id?: string
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_servico?: string[] | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: []
      }
      contratos_demanda: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          documento_url: string | null
          id: string
          numero_contrato: string
          status: Database["public"]["Enums"]["status_contrato"]
          tipo_contrato: Database["public"]["Enums"]["tipo_contrato"]
          updated_at: string | null
          valor_total: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          documento_url?: string | null
          id?: string
          numero_contrato: string
          status?: Database["public"]["Enums"]["status_contrato"]
          tipo_contrato: Database["public"]["Enums"]["tipo_contrato"]
          updated_at?: string | null
          valor_total?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          documento_url?: string | null
          id?: string
          numero_contrato?: string
          status?: Database["public"]["Enums"]["status_contrato"]
          tipo_contrato?: Database["public"]["Enums"]["tipo_contrato"]
          updated_at?: string | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_demanda_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_medico: {
        Row: {
          created_at: string | null
          data_assinatura: string | null
          documento_url: string | null
          id: string
          medico_id: string
          numero_contrato: string
          status_assinatura: Database["public"]["Enums"]["status_assinatura"]
          updated_at: string | null
          valor_hora: number | null
        }
        Insert: {
          created_at?: string | null
          data_assinatura?: string | null
          documento_url?: string | null
          id?: string
          medico_id: string
          numero_contrato: string
          status_assinatura?: Database["public"]["Enums"]["status_assinatura"]
          updated_at?: string | null
          valor_hora?: number | null
        }
        Update: {
          created_at?: string | null
          data_assinatura?: string | null
          documento_url?: string | null
          id?: string
          medico_id?: string
          numero_contrato?: string
          status_assinatura?: Database["public"]["Enums"]["status_assinatura"]
          updated_at?: string | null
          valor_hora?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_medico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      demandas: {
        Row: {
          contrato_demanda_id: string
          created_at: string | null
          especialidade_medica: string
          id: string
          local_atuacao: string
          observacoes: string | null
          periodo_fim: string | null
          periodo_inicio: string
          quantidade_medicos: number
          status: Database["public"]["Enums"]["status_demanda"]
          updated_at: string | null
        }
        Insert: {
          contrato_demanda_id: string
          created_at?: string | null
          especialidade_medica: string
          id?: string
          local_atuacao: string
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio: string
          quantidade_medicos?: number
          status?: Database["public"]["Enums"]["status_demanda"]
          updated_at?: string | null
        }
        Update: {
          contrato_demanda_id?: string
          created_at?: string | null
          especialidade_medica?: string
          id?: string
          local_atuacao?: string
          observacoes?: string | null
          periodo_fim?: string | null
          periodo_inicio?: string
          quantidade_medicos?: number
          status?: Database["public"]["Enums"]["status_demanda"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demandas_contrato_demanda_id_fkey"
            columns: ["contrato_demanda_id"]
            isOneToOne: false
            referencedRelation: "contratos_demanda"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas: {
        Row: {
          contrato_medico_id: string
          created_at: string | null
          data_escala: string
          demanda_id: string
          hora_fim: string
          hora_inicio: string
          id: string
          status_execucao: Database["public"]["Enums"]["status_execucao"]
          updated_at: string | null
          valor_pagamento: number | null
        }
        Insert: {
          contrato_medico_id: string
          created_at?: string | null
          data_escala: string
          demanda_id: string
          hora_fim: string
          hora_inicio: string
          id?: string
          status_execucao?: Database["public"]["Enums"]["status_execucao"]
          updated_at?: string | null
          valor_pagamento?: number | null
        }
        Update: {
          contrato_medico_id?: string
          created_at?: string | null
          data_escala?: string
          demanda_id?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          status_execucao?: Database["public"]["Enums"]["status_execucao"]
          updated_at?: string | null
          valor_pagamento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "escalas_contrato_medico_id_fkey"
            columns: ["contrato_medico_id"]
            isOneToOne: false
            referencedRelation: "contratos_medico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_acessos: {
        Row: {
          acao: string
          created_at: string | null
          detalhes: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          detalhes?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      kanban_status_config: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string | null
          id: string
          label: string
          modulo: string
          ordem: number
          status_id: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          label: string
          modulo: string
          ordem: number
          status_id: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string | null
          id?: string
          label?: string
          modulo?: string
          ordem?: number
          status_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          cidade: string | null
          created_at: string | null
          crm: string | null
          email: string | null
          especialidade: string | null
          id: string
          nome: string
          observacoes: string | null
          origem: string | null
          status: string | null
          telefone: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          crm?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          origem?: string | null
          status?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          crm?: string | null
          email?: string | null
          especialidade?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem?: string | null
          status?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      licitacoes: {
        Row: {
          created_at: string | null
          data_abertura: string | null
          data_limite: string | null
          id: string
          numero_edital: string
          objeto: string
          observacoes: string | null
          orgao: string
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_licitacao"]
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string | null
          data_abertura?: string | null
          data_limite?: string | null
          id?: string
          numero_edital: string
          objeto: string
          observacoes?: string | null
          orgao: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_licitacao"]
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string | null
          data_abertura?: string | null
          data_limite?: string | null
          id?: string
          numero_edital?: string
          objeto?: string
          observacoes?: string | null
          orgao?: string
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_licitacao"]
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: []
      }
      log_auditoria: {
        Row: {
          acao: string
          created_at: string | null
          dados_anteriores: Json | null
          dados_novos: Json | null
          id: string
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_anteriores?: Json | null
          dados_novos?: Json | null
          id?: string
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      medicos: {
        Row: {
          cliente_vinculado_id: string | null
          created_at: string | null
          crm: string
          documentos_url: string[] | null
          email: string
          especialidade: string
          id: string
          nome_completo: string
          status_documentacao: Database["public"]["Enums"]["status_documentacao"]
          status_medico: string | null
          telefone: string
          updated_at: string | null
        }
        Insert: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          crm: string
          documentos_url?: string[] | null
          email: string
          especialidade: string
          id?: string
          nome_completo: string
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          status_medico?: string | null
          telefone: string
          updated_at?: string | null
        }
        Update: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          crm?: string
          documentos_url?: string[] | null
          email?: string
          especialidade?: string
          id?: string
          nome_completo?: string
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          status_medico?: string | null
          telefone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      menu_permissions: {
        Row: {
          can_access: boolean | null
          created_at: string | null
          id: string
          menu_item: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_access?: boolean | null
          created_at?: string | null
          id?: string
          menu_item: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_access?: boolean | null
          created_at?: string | null
          id?: string
          menu_item?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      pagamentos_medico: {
        Row: {
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          escala_id: string
          id: string
          medico_id: string
          status_pagamento: Database["public"]["Enums"]["status_pagamento"]
          updated_at: string | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          escala_id: string
          id?: string
          medico_id: string
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor: number
        }
        Update: {
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          escala_id?: string
          id?: string
          medico_id?: string
          status_pagamento?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_medico_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_medico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          nome_completo: string
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          nome_completo: string
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          nome_completo?: string
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      propostas_medicas: {
        Row: {
          created_at: string | null
          data_envio: string | null
          demanda_id: string
          id: string
          medico_id: string
          observacoes: string | null
          status_proposta: Database["public"]["Enums"]["status_proposta"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_envio?: string | null
          demanda_id: string
          id?: string
          medico_id: string
          observacoes?: string | null
          status_proposta?: Database["public"]["Enums"]["status_proposta"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_envio?: string | null
          demanda_id?: string
          id?: string
          medico_id?: string
          observacoes?: string | null
          status_proposta?: Database["public"]["Enums"]["status_proposta"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_medicas_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_medicas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      recebimentos_cliente: {
        Row: {
          contrato_demanda_id: string
          created_at: string | null
          data_recebimento: string | null
          data_vencimento: string
          id: string
          status_recebimento: Database["public"]["Enums"]["status_pagamento"]
          updated_at: string | null
          valor: number
        }
        Insert: {
          contrato_demanda_id: string
          created_at?: string | null
          data_recebimento?: string | null
          data_vencimento: string
          id?: string
          status_recebimento?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor: number
        }
        Update: {
          contrato_demanda_id?: string
          created_at?: string | null
          data_recebimento?: string | null
          data_vencimento?: string
          id?: string
          status_recebimento?: Database["public"]["Enums"]["status_pagamento"]
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recebimentos_cliente_contrato_demanda_id_fkey"
            columns: ["contrato_demanda_id"]
            isOneToOne: false
            referencedRelation: "contratos_demanda"
            referencedColumns: ["id"]
          },
        ]
      }
      relacionamento_medico: {
        Row: {
          cliente_vinculado_id: string | null
          created_at: string | null
          descricao: string
          id: string
          medico_vinculado_id: string | null
          tipo: Database["public"]["Enums"]["tipo_relacionamento"]
          updated_at: string | null
        }
        Insert: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          descricao: string
          id?: string
          medico_vinculado_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_relacionamento"]
          updated_at?: string | null
        }
        Update: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          descricao?: string
          id?: string
          medico_vinculado_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_relacionamento"]
          updated_at?: string | null
        }
        Relationships: []
      }
      unidades: {
        Row: {
          cidade: string | null
          cliente_id: string | null
          created_at: string | null
          endereco: string | null
          id: string
          nome: string
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          cliente_id?: string | null
          created_at?: string | null
          endereco?: string | null
          id?: string
          nome: string
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          cliente_id?: string | null
          created_at?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worklist_tarefas: {
        Row: {
          contrato_id: string | null
          created_at: string | null
          created_by: string | null
          data_limite: string | null
          descricao: string | null
          id: string
          licitacao_id: string | null
          modulo: string
          prioridade: string | null
          relacionamento_id: string | null
          responsavel_id: string | null
          status: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_limite?: string | null
          descricao?: string | null
          id?: string
          licitacao_id?: string | null
          modulo: string
          prioridade?: string | null
          relacionamento_id?: string | null
          responsavel_id?: string | null
          status: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          contrato_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_limite?: string | null
          descricao?: string | null
          id?: string
          licitacao_id?: string | null
          modulo?: string
          prioridade?: string | null
          relacionamento_id?: string | null
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor_demanda"
        | "recrutador"
        | "coordenador_escalas"
        | "financeiro"
        | "medico"
      especialidade_cliente: "Hospital" | "Clínica" | "UBS" | "Outros"
      status_assinatura: "pendente" | "assinado" | "cancelado"
      status_assinatura_contrato: "Sim" | "Pendente"
      status_cliente: "Ativo" | "Inativo" | "Suspenso" | "Cancelado"
      status_contrato: "ativo" | "inativo" | "suspenso"
      status_demanda: "aberta" | "em_atendimento" | "concluida" | "cancelada"
      status_disparo:
        | "nova_oportunidade"
        | "disparo"
        | "analise_proposta"
        | "negociacao"
        | "investigacao"
        | "proposta_aceita"
        | "proposta_arquivada"
        | "relacionamento_medico"
      status_documentacao: "pendente" | "em_analise" | "aprovada" | "reprovada"
      status_execucao: "pendente" | "executada" | "cancelada"
      status_licitacao:
        | "captacao_edital"
        | "edital_analise"
        | "deliberacao"
        | "esclarecimentos_impugnacao"
        | "cadastro_proposta"
        | "aguardando_sessao"
        | "em_disputa"
        | "proposta_final"
        | "recurso_contrarrazao"
        | "adjudicacao_homologacao"
        | "arrematados"
        | "descarte_edital"
        | "nao_ganhamos"
      status_medico: "Ativo" | "Inativo" | "Suspenso"
      status_pagamento: "pendente" | "pago" | "atrasado" | "cancelado"
      status_proposta: "pendente" | "aceita" | "recusada"
      status_relacionamento:
        | "inicio_identificacao"
        | "captacao_documentacao"
        | "pendencia_documentacao"
        | "documentacao_finalizada"
        | "criacao_escalas"
      tipo_contrato: "licitacao" | "privado"
      tipo_relacionamento:
        | "Reclamação"
        | "Feedback Positivo"
        | "Alinhamento Escalas"
        | "Ação Comemorativa"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "gestor_demanda",
        "recrutador",
        "coordenador_escalas",
        "financeiro",
        "medico",
      ],
      especialidade_cliente: ["Hospital", "Clínica", "UBS", "Outros"],
      status_assinatura: ["pendente", "assinado", "cancelado"],
      status_assinatura_contrato: ["Sim", "Pendente"],
      status_cliente: ["Ativo", "Inativo", "Suspenso", "Cancelado"],
      status_contrato: ["ativo", "inativo", "suspenso"],
      status_demanda: ["aberta", "em_atendimento", "concluida", "cancelada"],
      status_disparo: [
        "nova_oportunidade",
        "disparo",
        "analise_proposta",
        "negociacao",
        "investigacao",
        "proposta_aceita",
        "proposta_arquivada",
        "relacionamento_medico",
      ],
      status_documentacao: ["pendente", "em_analise", "aprovada", "reprovada"],
      status_execucao: ["pendente", "executada", "cancelada"],
      status_licitacao: [
        "captacao_edital",
        "edital_analise",
        "deliberacao",
        "esclarecimentos_impugnacao",
        "cadastro_proposta",
        "aguardando_sessao",
        "em_disputa",
        "proposta_final",
        "recurso_contrarrazao",
        "adjudicacao_homologacao",
        "arrematados",
        "descarte_edital",
        "nao_ganhamos",
      ],
      status_medico: ["Ativo", "Inativo", "Suspenso"],
      status_pagamento: ["pendente", "pago", "atrasado", "cancelado"],
      status_proposta: ["pendente", "aceita", "recusada"],
      status_relacionamento: [
        "inicio_identificacao",
        "captacao_documentacao",
        "pendencia_documentacao",
        "documentacao_finalizada",
        "criacao_escalas",
      ],
      tipo_contrato: ["licitacao", "privado"],
      tipo_relacionamento: [
        "Reclamação",
        "Feedback Positivo",
        "Alinhamento Escalas",
        "Ação Comemorativa",
      ],
    },
  },
} as const
