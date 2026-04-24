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
          ages_unidades_ids: string[] | null
          assinado: string | null
          carga_horaria_mensal: number | null
          cliente_id: string | null
          codigo_contrato: string | null
          codigo_interno: number | null
          condicao_pagamento: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          dias_antecedencia_aviso: number | null
          documento_url: string | null
          id: string
          motivo_pendente: string | null
          objeto_contrato: string | null
          observacoes: string | null
          prazo_meses: number | null
          profissional_id: string | null
          status: string
          tipo_contrato: string | null
          tipo_servico: string[] | null
          unidade_id: string | null
          updated_at: string
          valor_estimado: string | null
          valor_hora: number | null
          valor_mensal: number | null
        }
        Insert: {
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
          ages_unidades_ids?: string[] | null
          assinado?: string | null
          carga_horaria_mensal?: number | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          dias_antecedencia_aviso?: number | null
          documento_url?: string | null
          id?: string
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          observacoes?: string | null
          prazo_meses?: number | null
          profissional_id?: string | null
          status?: string
          tipo_contrato?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string
          valor_estimado?: string | null
          valor_hora?: number | null
          valor_mensal?: number | null
        }
        Update: {
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
          ages_unidades_ids?: string[] | null
          assinado?: string | null
          carga_horaria_mensal?: number | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          dias_antecedencia_aviso?: number | null
          documento_url?: string | null
          id?: string
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          observacoes?: string | null
          prazo_meses?: number | null
          profissional_id?: string | null
          status?: string
          tipo_contrato?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string
          valor_estimado?: string | null
          valor_hora?: number | null
          valor_mensal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ages_contratos_ages_cliente_id_fkey"
            columns: ["ages_cliente_id"]
            isOneToOne: false
            referencedRelation: "ages_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_contratos_ages_unidade_id_fkey"
            columns: ["ages_unidade_id"]
            isOneToOne: false
            referencedRelation: "ages_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_contratos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_contratos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
          cnpj: string | null
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
          cnpj?: string | null
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
          cnpj?: string | null
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
        Relationships: [
          {
            foreignKeyName: "ages_licitacoes_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ages_producao: {
        Row: {
          ages_cliente_id: string | null
          ages_unidade_id: string | null
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
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
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
          ages_cliente_id?: string | null
          ages_unidade_id?: string | null
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
            foreignKeyName: "ages_producao_ages_cliente_id_fkey"
            columns: ["ages_cliente_id"]
            isOneToOne: false
            referencedRelation: "ages_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_producao_ages_unidade_id_fkey"
            columns: ["ages_unidade_id"]
            isOneToOne: false
            referencedRelation: "ages_unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_producao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_producao_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "ages_profissionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ages_producao_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
      api_tokens: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          nome: string
          token: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          nome: string
          token: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          nome?: string
          token?: string
        }
        Relationships: []
      }
      auditoria_logs: {
        Row: {
          acao: string
          autorizado: boolean | null
          campos_alterados: string[] | null
          created_at: string
          dados_antigos: Json | null
          dados_novos: Json | null
          detalhes: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          modulo: string
          motivo_bloqueio: string | null
          registro_descricao: string | null
          registro_id: string | null
          tabela: string
          user_agent: string | null
          usuario_id: string | null
          usuario_nome: string
          usuario_perfil: string | null
        }
        Insert: {
          acao: string
          autorizado?: boolean | null
          campos_alterados?: string[] | null
          created_at?: string
          dados_antigos?: Json | null
          dados_novos?: Json | null
          detalhes?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          modulo: string
          motivo_bloqueio?: string | null
          registro_descricao?: string | null
          registro_id?: string | null
          tabela: string
          user_agent?: string | null
          usuario_id?: string | null
          usuario_nome: string
          usuario_perfil?: string | null
        }
        Update: {
          acao?: string
          autorizado?: boolean | null
          campos_alterados?: string[] | null
          created_at?: string
          dados_antigos?: Json | null
          dados_novos?: Json | null
          detalhes?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          modulo?: string
          motivo_bloqueio?: string | null
          registro_descricao?: string | null
          registro_id?: string | null
          tabela?: string
          user_agent?: string | null
          usuario_id?: string | null
          usuario_nome?: string
          usuario_perfil?: string | null
        }
        Relationships: []
      }
      automacoes_config: {
        Row: {
          acao: string
          ativo: boolean | null
          config: Json | null
          created_at: string | null
          id: string
          nome: string
          tipo: string
          trigger_etapa:
            | Database["public"]["Enums"]["etapa_funil_marketing"]
            | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          acao: string
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          id?: string
          nome: string
          tipo: string
          trigger_etapa?:
            | Database["public"]["Enums"]["etapa_funil_marketing"]
            | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          acao?: string
          ativo?: boolean | null
          config?: Json | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string
          trigger_etapa?:
            | Database["public"]["Enums"]["etapa_funil_marketing"]
            | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      banco_interesse_leads: {
        Row: {
          cidades: string[] | null
          confianca_score: number | null
          created_at: string
          dias_preferidos: string[] | null
          disponibilidade_plantoes_mes: number | null
          encaminhado_por: string | null
          encaminhado_por_nome: string | null
          especialidades_interesse: string[] | null
          extracao_fonte: string | null
          id: string
          lead_id: string
          modalidade_preferida: string[] | null
          observacoes_ia: string | null
          periodo_preferido: string | null
          tipo_contratacao_preferida: string[] | null
          ufs: string[] | null
          ultima_extracao_em: string | null
          valor_minimo_aceitavel: number | null
          valor_minimo_unidade: string | null
        }
        Insert: {
          cidades?: string[] | null
          confianca_score?: number | null
          created_at?: string
          dias_preferidos?: string[] | null
          disponibilidade_plantoes_mes?: number | null
          encaminhado_por?: string | null
          encaminhado_por_nome?: string | null
          especialidades_interesse?: string[] | null
          extracao_fonte?: string | null
          id?: string
          lead_id: string
          modalidade_preferida?: string[] | null
          observacoes_ia?: string | null
          periodo_preferido?: string | null
          tipo_contratacao_preferida?: string[] | null
          ufs?: string[] | null
          ultima_extracao_em?: string | null
          valor_minimo_aceitavel?: number | null
          valor_minimo_unidade?: string | null
        }
        Update: {
          cidades?: string[] | null
          confianca_score?: number | null
          created_at?: string
          dias_preferidos?: string[] | null
          disponibilidade_plantoes_mes?: number | null
          encaminhado_por?: string | null
          encaminhado_por_nome?: string | null
          especialidades_interesse?: string[] | null
          extracao_fonte?: string | null
          id?: string
          lead_id?: string
          modalidade_preferida?: string[] | null
          observacoes_ia?: string | null
          periodo_preferido?: string | null
          tipo_contratacao_preferida?: string[] | null
          ufs?: string[] | null
          ultima_extracao_em?: string | null
          valor_minimo_aceitavel?: number | null
          valor_minimo_unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regiao_interesse_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regiao_interesse_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regiao_interesse_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      bi_client_import_rows: {
        Row: {
          created_at: string
          dados: Json
          erro_mensagem: string | null
          id: string
          import_id: string
          linha_numero: number
          status: string
        }
        Insert: {
          created_at?: string
          dados?: Json
          erro_mensagem?: string | null
          id?: string
          import_id: string
          linha_numero: number
          status?: string
        }
        Update: {
          created_at?: string
          dados?: Json
          erro_mensagem?: string | null
          id?: string
          import_id?: string
          linha_numero?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_client_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "bi_client_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_client_imports: {
        Row: {
          arquivo_nome: string
          arquivo_url: string | null
          cliente_id: string
          created_at: string
          id: string
          status: string
          total_erros: number
          total_registros: number
          updated_at: string
          uploaded_by: string | null
          uploaded_by_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url?: string | null
          cliente_id: string
          created_at?: string
          id?: string
          status?: string
          total_erros?: number
          total_registros?: number
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string | null
          cliente_id?: string
          created_at?: string
          id?: string
          status?: string
          total_erros?: number
          total_registros?: number
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bi_client_imports_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "bi_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_clientes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
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
      cadencia_passos: {
        Row: {
          canal: string
          dia_offset: number
          id: string
          is_breakup: boolean
          is_inicial: boolean
          mensagem_template: string | null
          objetivo: string | null
          ordem: number
          subject_template: string | null
          template_id: string
        }
        Insert: {
          canal: string
          dia_offset: number
          id?: string
          is_breakup?: boolean
          is_inicial?: boolean
          mensagem_template?: string | null
          objetivo?: string | null
          ordem: number
          subject_template?: string | null
          template_id: string
        }
        Update: {
          canal?: string
          dia_offset?: number
          id?: string
          is_breakup?: boolean
          is_inicial?: boolean
          mensagem_template?: string | null
          objetivo?: string | null
          ordem?: number
          subject_template?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadencia_passos_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "cadencia_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cadencia_templates: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          is_default: boolean
          nome: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_default?: boolean
          nome: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          is_default?: boolean
          nome?: string
        }
        Relationships: []
      }
      campanha_lead_touches: {
        Row: {
          campanha_lead_id: string
          canal: string
          chip_usado_id: string | null
          contato_usado_id: string | null
          conteudo_enviado: string | null
          erro_detalhe: string | null
          executado_em: string
          id: string
          ordem: number | null
          passo_id: string | null
          resultado: string | null
        }
        Insert: {
          campanha_lead_id: string
          canal: string
          chip_usado_id?: string | null
          contato_usado_id?: string | null
          conteudo_enviado?: string | null
          erro_detalhe?: string | null
          executado_em?: string
          id?: string
          ordem?: number | null
          passo_id?: string | null
          resultado?: string | null
        }
        Update: {
          campanha_lead_id?: string
          canal?: string
          chip_usado_id?: string | null
          contato_usado_id?: string | null
          conteudo_enviado?: string | null
          erro_detalhe?: string | null
          executado_em?: string
          id?: string
          ordem?: number | null
          passo_id?: string | null
          resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_lead_touches_campanha_lead_id_fkey"
            columns: ["campanha_lead_id"]
            isOneToOne: false
            referencedRelation: "campanha_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_lead_touches_campanha_lead_id_fkey"
            columns: ["campanha_lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["campanha_lead_id"]
          },
          {
            foreignKeyName: "campanha_lead_touches_chip_usado_id_fkey"
            columns: ["chip_usado_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_lead_touches_chip_usado_id_fkey"
            columns: ["chip_usado_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "campanha_lead_touches_contato_usado_id_fkey"
            columns: ["contato_usado_id"]
            isOneToOne: false
            referencedRelation: "lead_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_lead_touches_passo_id_fkey"
            columns: ["passo_id"]
            isOneToOne: false
            referencedRelation: "cadencia_passos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_leads: {
        Row: {
          aguarda_resposta_humana: boolean
          campanha_id: string
          canal_atual: string | null
          chip_usado_id: string | null
          conversa_id: string | null
          created_at: string | null
          data_primeiro_contato: string | null
          data_status: string | null
          data_ultimo_contato: string | null
          erro_envio: string | null
          historico_conversa: Json | null
          humano_assumiu: boolean | null
          id: string
          lead_id: string
          mensagem_enviada: string | null
          metadados: Json | null
          proximo_passo_id: string | null
          proximo_touch_em: string | null
          status: Database["public"]["Enums"]["status_lead_campanha"]
          tentativas: number | null
          touches_executados: number
          updated_at: string | null
          variation_indices: number[] | null
        }
        Insert: {
          aguarda_resposta_humana?: boolean
          campanha_id: string
          canal_atual?: string | null
          chip_usado_id?: string | null
          conversa_id?: string | null
          created_at?: string | null
          data_primeiro_contato?: string | null
          data_status?: string | null
          data_ultimo_contato?: string | null
          erro_envio?: string | null
          historico_conversa?: Json | null
          humano_assumiu?: boolean | null
          id?: string
          lead_id: string
          mensagem_enviada?: string | null
          metadados?: Json | null
          proximo_passo_id?: string | null
          proximo_touch_em?: string | null
          status?: Database["public"]["Enums"]["status_lead_campanha"]
          tentativas?: number | null
          touches_executados?: number
          updated_at?: string | null
          variation_indices?: number[] | null
        }
        Update: {
          aguarda_resposta_humana?: boolean
          campanha_id?: string
          canal_atual?: string | null
          chip_usado_id?: string | null
          conversa_id?: string | null
          created_at?: string | null
          data_primeiro_contato?: string | null
          data_status?: string | null
          data_ultimo_contato?: string | null
          erro_envio?: string | null
          historico_conversa?: Json | null
          humano_assumiu?: boolean | null
          id?: string
          lead_id?: string
          mensagem_enviada?: string | null
          metadados?: Json | null
          proximo_passo_id?: string | null
          proximo_touch_em?: string | null
          status?: Database["public"]["Enums"]["status_lead_campanha"]
          tentativas?: number | null
          touches_executados?: number
          updated_at?: string | null
          variation_indices?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "campanha_leads_proximo_passo_id_fkey"
            columns: ["proximo_passo_id"]
            isOneToOne: false
            referencedRelation: "cadencia_passos"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_listas: {
        Row: {
          campanha_id: string
          created_at: string
          created_by: string | null
          id: string
          lista_id: string
        }
        Insert: {
          campanha_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lista_id: string
        }
        Update: {
          campanha_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_listas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_listas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_listas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "disparo_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_msg_queue: {
        Row: {
          created_at: string | null
          from_me: boolean | null
          id: string
          instance_name: string
          media_url: string | null
          msg_id: string
          msg_text: string | null
          msg_type: string | null
          phone: string
        }
        Insert: {
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          instance_name: string
          media_url?: string | null
          msg_id: string
          msg_text?: string | null
          msg_type?: string | null
          phone: string
        }
        Update: {
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          instance_name?: string
          media_url?: string | null
          msg_id?: string
          msg_text?: string | null
          msg_type?: string | null
          phone?: string
        }
        Relationships: []
      }
      campanha_perguntas_pendentes: {
        Row: {
          alerta_enviado_em: string
          alerta_instance: string
          alerta_msg_id: string
          alerta_phone: string
          campanha_id: string
          campanha_lead_id: string
          contexto_conversa: string | null
          created_at: string
          id: string
          lead_id: string
          pergunta_medico: string
          pergunta_resumo: string | null
          relayed: boolean
          relayed_at: string | null
          relayed_text: string | null
          respondida: boolean
          respondida_at: string | null
          resposta_humana: string | null
        }
        Insert: {
          alerta_enviado_em?: string
          alerta_instance: string
          alerta_msg_id: string
          alerta_phone: string
          campanha_id: string
          campanha_lead_id: string
          contexto_conversa?: string | null
          created_at?: string
          id?: string
          lead_id: string
          pergunta_medico: string
          pergunta_resumo?: string | null
          relayed?: boolean
          relayed_at?: string | null
          relayed_text?: string | null
          respondida?: boolean
          respondida_at?: string | null
          resposta_humana?: string | null
        }
        Update: {
          alerta_enviado_em?: string
          alerta_instance?: string
          alerta_msg_id?: string
          alerta_phone?: string
          campanha_id?: string
          campanha_lead_id?: string
          contexto_conversa?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          pergunta_medico?: string
          pergunta_resumo?: string | null
          relayed?: boolean
          relayed_at?: string | null
          relayed_text?: string | null
          respondida?: boolean
          respondida_at?: string | null
          resposta_humana?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_perguntas_pendentes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_campanha_lead_id_fkey"
            columns: ["campanha_lead_id"]
            isOneToOne: false
            referencedRelation: "campanha_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_campanha_lead_id_fkey"
            columns: ["campanha_lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["campanha_lead_id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_perguntas_pendentes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      campanha_proposta_canais: {
        Row: {
          campanha_proposta_id: string
          canal: string
          concluido_em: string | null
          created_at: string
          id: string
          iniciado_em: string | null
          metadados: Json
          status: string
          updated_at: string
        }
        Insert: {
          campanha_proposta_id: string
          canal: string
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string | null
          metadados?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          campanha_proposta_id?: string
          canal?: string
          concluido_em?: string | null
          created_at?: string
          id?: string
          iniciado_em?: string | null
          metadados?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_proposta_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_proposta_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
        ]
      }
      campanha_proposta_lead_canais: {
        Row: {
          campanha_proposta_id: string
          canal: string
          created_at: string
          criado_por: string | null
          duracao_segundos: number | null
          entrou_em: string
          id: string
          lead_id: string
          motivo_movimentacao: string | null
          motivo_saida: string | null
          movido_por: string | null
          proximo_canal: string | null
          saiu_em: string | null
          status_final: string
          updated_at: string
        }
        Insert: {
          campanha_proposta_id: string
          canal: string
          created_at?: string
          criado_por?: string | null
          duracao_segundos?: number | null
          entrou_em?: string
          id?: string
          lead_id: string
          motivo_movimentacao?: string | null
          motivo_saida?: string | null
          movido_por?: string | null
          proximo_canal?: string | null
          saiu_em?: string | null
          status_final?: string
          updated_at?: string
        }
        Update: {
          campanha_proposta_id?: string
          canal?: string
          created_at?: string
          criado_por?: string | null
          duracao_segundos?: number | null
          entrou_em?: string
          id?: string
          lead_id?: string
          motivo_movimentacao?: string | null
          motivo_saida?: string | null
          movido_por?: string | null
          proximo_canal?: string | null
          saiu_em?: string | null
          status_final?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_proposta_lead_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_proposta_lead_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
        ]
      }
      campanha_propostas: {
        Row: {
          campanha_id: string
          created_at: string
          created_by: string | null
          encerrada_em: string | null
          encerrada_por: string | null
          id: string
          lista_id: string | null
          proposta_id: string
          status: string
          updated_at: string
          webhook_trafego_enviado_at: string | null
        }
        Insert: {
          campanha_id: string
          created_at?: string
          created_by?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          id?: string
          lista_id?: string | null
          proposta_id: string
          status?: string
          updated_at?: string
          webhook_trafego_enviado_at?: string | null
        }
        Update: {
          campanha_id?: string
          created_at?: string
          created_by?: string | null
          encerrada_em?: string | null
          encerrada_por?: string | null
          id?: string
          lista_id?: string | null
          proposta_id?: string
          status?: string
          updated_at?: string
          webhook_trafego_enviado_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_propostas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_propostas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_propostas_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "disparo_listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_propostas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          agendamento_tipo: string | null
          arquivo_csv_url: string | null
          assunto_email: string | null
          batch_size: number | null
          briefing_ia: Json | null
          cadencia_ativa: boolean
          cadencia_template_id: string | null
          canal: Database["public"]["Enums"]["canal_campanha"]
          chip_fallback_id: string | null
          chip_id: string | null
          chip_ids: string[] | null
          corpo_html: string | null
          created_at: string | null
          criado_por: string | null
          custo_total: number | null
          data_agendamento: string | null
          data_inicio: string | null
          data_termino: string | null
          delay_between_batches_max: number | null
          delay_between_batches_min: number | null
          delay_max_ms: number | null
          delay_min_ms: number | null
          descricao: string | null
          disparos_enviados: number | null
          disparos_falhas: number | null
          empresas_vinculadas: string[] | null
          especialidade_id: string | null
          horario_inteligente: boolean | null
          id: string
          limite_diario_campanha: number | null
          mensagem: string | null
          mensagem_inicial: string | null
          next_batch_at: string | null
          nome: string
          objetivo: string | null
          orcamento: number | null
          pecas_url: string[] | null
          publico_alvo: Json | null
          regiao_cidades: string[] | null
          regiao_estado: string | null
          responsaveis: string[] | null
          responsavel_id: string | null
          rotation_strategy: string | null
          segmento_id: string | null
          setores_vinculados: string[] | null
          status: Database["public"]["Enums"]["status_campanha"]
          tamanho_lote: number | null
          tipo_campanha: string | null
          total_aberturas: number | null
          total_aquecido: number | null
          total_cliques: number | null
          total_contatado: number | null
          total_conversoes: number | null
          total_convertido: number | null
          total_em_conversa: number | null
          total_entregues: number | null
          total_enviados: number | null
          total_frio: number | null
          total_quente: number | null
          total_respostas: number | null
          updated_at: string | null
          variaveis_dinamicas: string[] | null
        }
        Insert: {
          agendamento_tipo?: string | null
          arquivo_csv_url?: string | null
          assunto_email?: string | null
          batch_size?: number | null
          briefing_ia?: Json | null
          cadencia_ativa?: boolean
          cadencia_template_id?: string | null
          canal: Database["public"]["Enums"]["canal_campanha"]
          chip_fallback_id?: string | null
          chip_id?: string | null
          chip_ids?: string[] | null
          corpo_html?: string | null
          created_at?: string | null
          criado_por?: string | null
          custo_total?: number | null
          data_agendamento?: string | null
          data_inicio?: string | null
          data_termino?: string | null
          delay_between_batches_max?: number | null
          delay_between_batches_min?: number | null
          delay_max_ms?: number | null
          delay_min_ms?: number | null
          descricao?: string | null
          disparos_enviados?: number | null
          disparos_falhas?: number | null
          empresas_vinculadas?: string[] | null
          especialidade_id?: string | null
          horario_inteligente?: boolean | null
          id?: string
          limite_diario_campanha?: number | null
          mensagem?: string | null
          mensagem_inicial?: string | null
          next_batch_at?: string | null
          nome: string
          objetivo?: string | null
          orcamento?: number | null
          pecas_url?: string[] | null
          publico_alvo?: Json | null
          regiao_cidades?: string[] | null
          regiao_estado?: string | null
          responsaveis?: string[] | null
          responsavel_id?: string | null
          rotation_strategy?: string | null
          segmento_id?: string | null
          setores_vinculados?: string[] | null
          status?: Database["public"]["Enums"]["status_campanha"]
          tamanho_lote?: number | null
          tipo_campanha?: string | null
          total_aberturas?: number | null
          total_aquecido?: number | null
          total_cliques?: number | null
          total_contatado?: number | null
          total_conversoes?: number | null
          total_convertido?: number | null
          total_em_conversa?: number | null
          total_entregues?: number | null
          total_enviados?: number | null
          total_frio?: number | null
          total_quente?: number | null
          total_respostas?: number | null
          updated_at?: string | null
          variaveis_dinamicas?: string[] | null
        }
        Update: {
          agendamento_tipo?: string | null
          arquivo_csv_url?: string | null
          assunto_email?: string | null
          batch_size?: number | null
          briefing_ia?: Json | null
          cadencia_ativa?: boolean
          cadencia_template_id?: string | null
          canal?: Database["public"]["Enums"]["canal_campanha"]
          chip_fallback_id?: string | null
          chip_id?: string | null
          chip_ids?: string[] | null
          corpo_html?: string | null
          created_at?: string | null
          criado_por?: string | null
          custo_total?: number | null
          data_agendamento?: string | null
          data_inicio?: string | null
          data_termino?: string | null
          delay_between_batches_max?: number | null
          delay_between_batches_min?: number | null
          delay_max_ms?: number | null
          delay_min_ms?: number | null
          descricao?: string | null
          disparos_enviados?: number | null
          disparos_falhas?: number | null
          empresas_vinculadas?: string[] | null
          especialidade_id?: string | null
          horario_inteligente?: boolean | null
          id?: string
          limite_diario_campanha?: number | null
          mensagem?: string | null
          mensagem_inicial?: string | null
          next_batch_at?: string | null
          nome?: string
          objetivo?: string | null
          orcamento?: number | null
          pecas_url?: string[] | null
          publico_alvo?: Json | null
          regiao_cidades?: string[] | null
          regiao_estado?: string | null
          responsaveis?: string[] | null
          responsavel_id?: string | null
          rotation_strategy?: string | null
          segmento_id?: string | null
          setores_vinculados?: string[] | null
          status?: Database["public"]["Enums"]["status_campanha"]
          tamanho_lote?: number | null
          tipo_campanha?: string | null
          total_aberturas?: number | null
          total_aquecido?: number | null
          total_cliques?: number | null
          total_contatado?: number | null
          total_conversoes?: number | null
          total_convertido?: number | null
          total_em_conversa?: number | null
          total_entregues?: number | null
          total_enviados?: number | null
          total_frio?: number | null
          total_quente?: number | null
          total_respostas?: number | null
          updated_at?: string | null
          variaveis_dinamicas?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_cadencia_template_id_fkey"
            columns: ["cadencia_template_id"]
            isOneToOne: false
            referencedRelation: "cadencia_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_chip_fallback_id_fkey"
            columns: ["chip_fallback_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_chip_fallback_id_fkey"
            columns: ["chip_fallback_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "campanhas_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "campanhas_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas_envios: {
        Row: {
          campanha_id: string
          created_at: string | null
          data_abertura: string | null
          data_clique: string | null
          data_envio: string | null
          data_resposta: string | null
          destinatario_email: string | null
          destinatario_id: string | null
          destinatario_nome: string | null
          destinatario_telefone: string | null
          id: string
          motivo_falha: string | null
          status: string | null
        }
        Insert: {
          campanha_id: string
          created_at?: string | null
          data_abertura?: string | null
          data_clique?: string | null
          data_envio?: string | null
          data_resposta?: string | null
          destinatario_email?: string | null
          destinatario_id?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          id?: string
          motivo_falha?: string | null
          status?: string | null
        }
        Update: {
          campanha_id?: string
          created_at?: string | null
          data_abertura?: string | null
          data_clique?: string | null
          data_envio?: string | null
          data_resposta?: string | null
          destinatario_email?: string | null
          destinatario_id?: string | null
          destinatario_nome?: string | null
          destinatario_telefone?: string | null
          id?: string
          motivo_falha?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_envios_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      captacao_contratos_board: {
        Row: {
          contrato_id: string | null
          created_at: string
          created_by: string | null
          id: string
          origem_licitacao_id: string | null
          origem_tipo: Database["public"]["Enums"]["origem_tipo_board"]
          overlay_json: Json | null
          status: Database["public"]["Enums"]["status_captacao_board"]
          titulo_card: string
          updated_at: string
        }
        Insert: {
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origem_licitacao_id?: string | null
          origem_tipo?: Database["public"]["Enums"]["origem_tipo_board"]
          overlay_json?: Json | null
          status?: Database["public"]["Enums"]["status_captacao_board"]
          titulo_card: string
          updated_at?: string
        }
        Update: {
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          origem_licitacao_id?: string | null
          origem_tipo?: Database["public"]["Enums"]["origem_tipo_board"]
          overlay_json?: Json | null
          status?: Database["public"]["Enums"]["status_captacao_board"]
          titulo_card?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "captacao_contratos_board_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captacao_contratos_board_origem_licitacao_id_fkey"
            columns: ["origem_licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      captacao_leads: {
        Row: {
          created_at: string | null
          data_ultimo_contato: string | null
          disparo_log_id: string | null
          disparo_programado_id: string | null
          email: string | null
          email_resposta_id: string | null
          especialidade: string | null
          id: string
          medico_id: string | null
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          uf: string | null
          ultima_mensagem_enviada: string | null
          ultima_resposta_recebida: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_ultimo_contato?: string | null
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          email?: string | null
          email_resposta_id?: string | null
          especialidade?: string | null
          id?: string
          medico_id?: string | null
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          ultima_mensagem_enviada?: string | null
          ultima_resposta_recebida?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_ultimo_contato?: string | null
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          email?: string | null
          email_resposta_id?: string | null
          especialidade?: string | null
          id?: string
          medico_id?: string | null
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          uf?: string | null
          ultima_mensagem_enviada?: string | null
          ultima_resposta_recebida?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "captacao_leads_disparo_log_id_fkey"
            columns: ["disparo_log_id"]
            isOneToOne: false
            referencedRelation: "disparos_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captacao_leads_disparo_programado_id_fkey"
            columns: ["disparo_programado_id"]
            isOneToOne: false
            referencedRelation: "disparos_programados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captacao_leads_email_resposta_id_fkey"
            columns: ["email_resposta_id"]
            isOneToOne: false
            referencedRelation: "email_respostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captacao_leads_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      captacao_permissoes_usuario: {
        Row: {
          cor: string | null
          created_at: string
          id: string
          pode_acompanhamento: boolean
          pode_blacklist: boolean
          pode_contratos_servicos: boolean
          pode_disparos_email: boolean
          pode_disparos_zap: boolean
          pode_leads: boolean
          pode_seigzaps_config: boolean
          realtime_licitacoes: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          id?: string
          pode_acompanhamento?: boolean
          pode_blacklist?: boolean
          pode_contratos_servicos?: boolean
          pode_disparos_email?: boolean
          pode_disparos_zap?: boolean
          pode_leads?: boolean
          pode_seigzaps_config?: boolean
          realtime_licitacoes?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          id?: string
          pode_acompanhamento?: boolean
          pode_blacklist?: boolean
          pode_contratos_servicos?: boolean
          pode_disparos_email?: boolean
          pode_disparos_zap?: boolean
          pode_leads?: boolean
          pode_seigzaps_config?: boolean
          realtime_licitacoes?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      centros_custo: {
        Row: {
          codigo_interno: string | null
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          codigo_interno?: string | null
          created_at?: string | null
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          codigo_interno?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chips: {
        Row: {
          behavior_config: Json | null
          connection_state: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          engine: string | null
          id: string
          instance_id: string | null
          instance_name: string | null
          is_trafego_pago: boolean
          limite_diario: number | null
          nome: string
          numero: string | null
          origem_padrao_inbound: string | null
          pode_disparar: boolean | null
          profile_name: string | null
          profile_picture_url: string | null
          provedor: string | null
          proxy_config: Json | null
          status: string
          tipo_instancia: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          behavior_config?: Json | null
          connection_state?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          engine?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_trafego_pago?: boolean
          limite_diario?: number | null
          nome: string
          numero?: string | null
          origem_padrao_inbound?: string | null
          pode_disparar?: boolean | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provedor?: string | null
          proxy_config?: Json | null
          status?: string
          tipo_instancia?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          behavior_config?: Json | null
          connection_state?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          engine?: string | null
          id?: string
          instance_id?: string | null
          instance_name?: string | null
          is_trafego_pago?: boolean
          limite_diario?: number | null
          nome?: string
          numero?: string | null
          origem_padrao_inbound?: string | null
          pode_disparar?: boolean | null
          profile_name?: string | null
          profile_picture_url?: string | null
          provedor?: string | null
          proxy_config?: Json | null
          status?: string
          tipo_instancia?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          cnpj: string
          contato_principal: string
          created_at: string | null
          email_contato: string
          email_financeiro: string | null
          endereco: string | null
          especialidade_cliente:
            | Database["public"]["Enums"]["especialidade_cliente"]
            | null
          estado: string | null
          id: string
          nome_empresa: string
          nome_fantasia: string | null
          nome_unidade: string | null
          razao_social: string | null
          status_cliente: Database["public"]["Enums"]["status_cliente"] | null
          telefone_contato: string
          telefone_financeiro: string | null
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj: string
          contato_principal: string
          created_at?: string | null
          email_contato: string
          email_financeiro?: string | null
          endereco?: string | null
          especialidade_cliente?:
            | Database["public"]["Enums"]["especialidade_cliente"]
            | null
          estado?: string | null
          id?: string
          nome_empresa: string
          nome_fantasia?: string | null
          nome_unidade?: string | null
          razao_social?: string | null
          status_cliente?: Database["public"]["Enums"]["status_cliente"] | null
          telefone_contato: string
          telefone_financeiro?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string
          contato_principal?: string
          created_at?: string | null
          email_contato?: string
          email_financeiro?: string | null
          endereco?: string | null
          especialidade_cliente?:
            | Database["public"]["Enums"]["especialidade_cliente"]
            | null
          estado?: string | null
          id?: string
          nome_empresa?: string
          nome_fantasia?: string | null
          nome_unidade?: string | null
          razao_social?: string | null
          status_cliente?: Database["public"]["Enums"]["status_cliente"] | null
          telefone_contato?: string
          telefone_financeiro?: string | null
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      comunicacao_canais: {
        Row: {
          created_at: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      comunicacao_leituras: {
        Row: {
          created_at: string
          data_leitura: string
          id: string
          mensagem_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_leitura?: string
          id?: string
          mensagem_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_leitura?: string
          id?: string
          mensagem_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_leituras_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_mensagens: {
        Row: {
          anexos: string[] | null
          canal_id: string
          created_at: string
          data_envio: string
          deleted_at: string | null
          id: string
          mensagem: string | null
          reply_to_id: string | null
          updated_at: string
          user_id: string
          user_nome: string
        }
        Insert: {
          anexos?: string[] | null
          canal_id: string
          created_at?: string
          data_envio?: string
          deleted_at?: string | null
          id?: string
          mensagem?: string | null
          reply_to_id?: string | null
          updated_at?: string
          user_id: string
          user_nome: string
        }
        Update: {
          anexos?: string[] | null
          canal_id?: string
          created_at?: string
          data_envio?: string
          deleted_at?: string | null
          id?: string
          mensagem?: string | null
          reply_to_id?: string | null
          updated_at?: string
          user_id?: string
          user_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_mensagens_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacao_mensagens_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_notificacoes: {
        Row: {
          canal_id: string
          created_at: string
          id: string
          lida: boolean
          mensagem_id: string
          user_id: string
        }
        Insert: {
          canal_id: string
          created_at?: string
          id?: string
          lida?: boolean
          mensagem_id: string
          user_id: string
        }
        Update: {
          canal_id?: string
          created_at?: string
          id?: string
          lida?: boolean
          mensagem_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_notificacoes_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comunicacao_notificacoes_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_mensagens"
            referencedColumns: ["id"]
          },
        ]
      }
      comunicacao_participantes: {
        Row: {
          canal_id: string
          created_at: string
          id: string
          ultima_leitura: string | null
          user_id: string
        }
        Insert: {
          canal_id: string
          created_at?: string
          id?: string
          ultima_leitura?: string | null
          user_id: string
        }
        Update: {
          canal_id?: string
          created_at?: string
          id?: string
          ultima_leitura?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comunicacao_participantes_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_canais"
            referencedColumns: ["id"]
          },
        ]
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
      conteudos: {
        Row: {
          alcance: number | null
          anexos: string[] | null
          cliques: number | null
          created_at: string | null
          data_publicacao: string | null
          engajamento: number | null
          id: string
          observacoes: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["status_conteudo"]
          tags: string[] | null
          tipo: Database["public"]["Enums"]["tipo_conteudo"]
          titulo: string
          updated_at: string | null
        }
        Insert: {
          alcance?: number | null
          anexos?: string[] | null
          cliques?: number | null
          created_at?: string | null
          data_publicacao?: string | null
          engajamento?: number | null
          id?: string
          observacoes?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_conteudo"]
          tags?: string[] | null
          tipo: Database["public"]["Enums"]["tipo_conteudo"]
          titulo: string
          updated_at?: string | null
        }
        Update: {
          alcance?: number | null
          anexos?: string[] | null
          cliques?: number | null
          created_at?: string | null
          data_publicacao?: string | null
          engajamento?: number | null
          id?: string
          observacoes?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["status_conteudo"]
          tags?: string[] | null
          tipo?: Database["public"]["Enums"]["tipo_conteudo"]
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contrato_aditivos_tempo: {
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
            foreignKeyName: "contrato_aditivos_tempo_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_aditivos_tempo_dr_escala: {
        Row: {
          contrato_id: string
          created_at: string | null
          data_inicio: string
          data_termino: string
          id: string
          observacoes: string | null
          prazo_meses: number
          updated_at: string | null
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          data_inicio: string
          data_termino: string
          id?: string
          observacoes?: string | null
          prazo_meses: number
          updated_at?: string | null
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          data_inicio?: string
          data_termino?: string
          id?: string
          observacoes?: string | null
          prazo_meses?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_aditivos_tempo_dr_escala_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_escala"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_aditivos_tempo_dr_oportunidade: {
        Row: {
          contrato_id: string
          created_at: string | null
          data_inicio: string
          data_termino: string
          id: string
          observacoes: string | null
          prazo_meses: number
          updated_at: string | null
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          data_inicio: string
          data_termino: string
          id?: string
          observacoes?: string | null
          prazo_meses: number
          updated_at?: string | null
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          data_inicio?: string
          data_termino?: string
          id?: string
          observacoes?: string | null
          prazo_meses?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_aditivos_tempo_dr_oportunidade_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_oportunidade"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "contrato_anexos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_anexos_dr_escala: {
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
        Relationships: [
          {
            foreignKeyName: "contrato_anexos_dr_escala_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_escala"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_anexos_dr_oportunidade: {
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
        Relationships: [
          {
            foreignKeyName: "contrato_anexos_dr_oportunidade_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_oportunidade"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_capitacao: {
        Row: {
          atualizado_em: string
          contrato_id: string
          criado_em: string
          id: string
          setor: string
        }
        Insert: {
          atualizado_em?: string
          contrato_id: string
          criado_em?: string
          id?: string
          setor?: string
        }
        Update: {
          atualizado_em?: string
          contrato_id?: string
          criado_em?: string
          id?: string
          setor?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_capitacao_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_itens: {
        Row: {
          contrato_id: string
          created_at: string | null
          id: string
          item: string
          quantidade: number | null
          updated_at: string | null
          valor_item: number
        }
        Insert: {
          contrato_id: string
          created_at?: string | null
          id?: string
          item: string
          quantidade?: number | null
          updated_at?: string | null
          valor_item: number
        }
        Update: {
          contrato_id?: string
          created_at?: string | null
          id?: string
          item?: string
          quantidade?: number | null
          updated_at?: string | null
          valor_item?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_itens_dr_escala: {
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
            foreignKeyName: "contrato_itens_dr_escala_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_escala"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_itens_dr_oportunidade: {
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
            foreignKeyName: "contrato_itens_dr_oportunidade_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_oportunidade"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_rascunho: {
        Row: {
          consolidado_em: string | null
          consolidado_por: string | null
          contrato_id: string | null
          created_at: string
          created_by: string | null
          id: string
          licitacao_id: string | null
          overlay_json: Json
          servicos_json: Json | null
          status: string
          status_kanban: string
          updated_at: string
        }
        Insert: {
          consolidado_em?: string | null
          consolidado_por?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          licitacao_id?: string | null
          overlay_json?: Json
          servicos_json?: Json | null
          status?: string
          status_kanban?: string
          updated_at?: string
        }
        Update: {
          consolidado_em?: string | null
          consolidado_por?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          licitacao_id?: string | null
          overlay_json?: Json
          servicos_json?: Json | null
          status?: string
          status_kanban?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_rascunho_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_rascunho_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_rascunho_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_path: string | null
          arquivo_url: string
          contrato_rascunho_id: string
          created_at: string
          id: string
          mime_type: string | null
          origem: string
          uploaded_by: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_path?: string | null
          arquivo_url: string
          contrato_rascunho_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          origem?: string
          uploaded_by?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_path?: string | null
          arquivo_url?: string
          contrato_rascunho_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          origem?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_rascunho_anexos_contrato_rascunho_id_fkey"
            columns: ["contrato_rascunho_id"]
            isOneToOne: false
            referencedRelation: "contrato_rascunho"
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
        Relationships: [
          {
            foreignKeyName: "contrato_renovacoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_renovacoes_dr_escala: {
        Row: {
          contrato_id: string
          created_at: string
          data_vigencia: string
          id: string
          percentual_reajuste: number | null
          updated_at: string
          valor: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_vigencia: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_vigencia?: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_renovacoes_dr_escala_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_escala"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_renovacoes_dr_oportunidade: {
        Row: {
          contrato_id: string
          created_at: string
          data_vigencia: string
          id: string
          percentual_reajuste: number | null
          updated_at: string
          valor: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          data_vigencia: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          data_vigencia?: string
          id?: string
          percentual_reajuste?: number | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_renovacoes_dr_oportunidade_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos_dr_oportunidade"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          assinado: Database["public"]["Enums"]["status_assinatura_contrato"]
          cliente_id: string | null
          codigo_contrato: string | null
          codigo_interno: number | null
          condicao_pagamento: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          data_termino: string | null
          dias_aviso_vencimento: number | null
          documento_url: string | null
          especialidade_contrato: string | null
          id: string
          licitacao_origem_id: string | null
          medico_id: string | null
          motivo_pendente: string | null
          objeto_contrato: string | null
          prazo_meses: number | null
          status_contrato: string | null
          tipo_contratacao:
            | Database["public"]["Enums"]["tipo_contratacao"]
            | null
          tipo_servico: string[] | null
          unidade_id: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          assinado?: Database["public"]["Enums"]["status_assinatura_contrato"]
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?:
            | Database["public"]["Enums"]["tipo_contratacao"]
            | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          assinado?: Database["public"]["Enums"]["status_assinatura_contrato"]
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number | null
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?:
            | Database["public"]["Enums"]["tipo_contratacao"]
            | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_licitacao_origem_id_fkey"
            columns: ["licitacao_origem_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
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
      contratos_dr_escala: {
        Row: {
          assinado: string | null
          cliente_id: string | null
          codigo_contrato: string | null
          codigo_interno: number
          condicao_pagamento: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          data_termino: string | null
          dias_aviso_vencimento: number | null
          documento_url: string | null
          especialidade_contrato: string | null
          id: string
          licitacao_origem_id: string | null
          medico_id: string | null
          motivo_pendente: string | null
          objeto_contrato: string | null
          prazo_meses: number | null
          status_contrato: string | null
          tipo_contratacao: string | null
          tipo_servico: string[] | null
          unidade_id: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_dr_escala_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_escala_licitacao_origem_id_fkey"
            columns: ["licitacao_origem_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_escala_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_escala_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_dr_oportunidade: {
        Row: {
          assinado: string | null
          cliente_id: string | null
          codigo_contrato: string | null
          codigo_interno: number
          condicao_pagamento: string | null
          created_at: string | null
          data_fim: string
          data_inicio: string
          data_termino: string | null
          dias_aviso_vencimento: number | null
          documento_url: string | null
          especialidade_contrato: string | null
          id: string
          licitacao_origem_id: string | null
          medico_id: string | null
          motivo_pendente: string | null
          objeto_contrato: string | null
          prazo_meses: number | null
          status_contrato: string | null
          tipo_contratacao: string | null
          tipo_servico: string[] | null
          unidade_id: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim: string
          data_inicio: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          assinado?: string | null
          cliente_id?: string | null
          codigo_contrato?: string | null
          codigo_interno?: number
          condicao_pagamento?: string | null
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          data_termino?: string | null
          dias_aviso_vencimento?: number | null
          documento_url?: string | null
          especialidade_contrato?: string | null
          id?: string
          licitacao_origem_id?: string | null
          medico_id?: string | null
          motivo_pendente?: string | null
          objeto_contrato?: string | null
          prazo_meses?: number | null
          status_contrato?: string | null
          tipo_contratacao?: string | null
          tipo_servico?: string[] | null
          unidade_id?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_dr_oportunidade_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_oportunidade_licitacao_origem_id_fkey"
            columns: ["licitacao_origem_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_oportunidade_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_dr_oportunidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
      conversas: {
        Row: {
          created_at: string | null
          id: string
          id_conversa: string
          nome_contato: string
          numero_contato: string
          responsavel_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          id_conversa: string
          nome_contato: string
          numero_contato: string
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          id_conversa?: string
          nome_contato?: string
          numero_contato?: string
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "vw_produtividade_disparos"
            referencedColumns: ["user_id"]
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
      disparo_lista_itens: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          lead_id: string
          lista_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          lista_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          lista_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparo_lista_itens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_lista_itens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_lista_itens_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "disparo_lista_itens_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "disparo_listas"
            referencedColumns: ["id"]
          },
        ]
      }
      disparo_listas: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          descricao: string | null
          excluir_blacklist: boolean
          filtro_cidades: string[] | null
          filtro_especialidades: string[] | null
          filtro_status: string[] | null
          filtro_ufs: string[] | null
          id: string
          nome: string
          total_estimado: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          descricao?: string | null
          excluir_blacklist?: boolean
          filtro_cidades?: string[] | null
          filtro_especialidades?: string[] | null
          filtro_status?: string[] | null
          filtro_ufs?: string[] | null
          id?: string
          nome: string
          total_estimado?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          descricao?: string | null
          excluir_blacklist?: boolean
          filtro_cidades?: string[] | null
          filtro_especialidades?: string[] | null
          filtro_status?: string[] | null
          filtro_ufs?: string[] | null
          id?: string
          nome?: string
          total_estimado?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      disparo_manual_envios: {
        Row: {
          campanha_proposta_id: string
          conversation_id: string | null
          created_at: string
          enviado_por: string | null
          erro: string | null
          id: string
          instance_id: string | null
          lead_id: string
          mensagem: string
          phone_e164: string
          status: string
        }
        Insert: {
          campanha_proposta_id: string
          conversation_id?: string | null
          created_at?: string
          enviado_por?: string | null
          erro?: string | null
          id?: string
          instance_id?: string | null
          lead_id: string
          mensagem: string
          phone_e164: string
          status?: string
        }
        Update: {
          campanha_proposta_id?: string
          conversation_id?: string | null
          created_at?: string
          enviado_por?: string | null
          erro?: string | null
          id?: string
          instance_id?: string | null
          lead_id?: string
          mensagem?: string
          phone_e164?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparo_manual_envios_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sigzap_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparo_manual_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      disparos_anotacoes: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_hora: string
          id: string
          texto_anotacao: string
          updated_at: string | null
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_hora?: string
          id?: string
          texto_anotacao: string
          updated_at?: string | null
          usuario_id?: string | null
          usuario_nome: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_hora?: string
          id?: string
          texto_anotacao?: string
          updated_at?: string | null
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_anotacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_campanhas: {
        Row: {
          ativo: boolean
          campanha_id: string | null
          campanha_proposta_id: string | null
          chip_id: string | null
          created_at: string | null
          enviados: number | null
          falhas: number | null
          ia_ativa: boolean
          id: string
          instancia: string | null
          nome: string
          nozap: number | null
          proposta_id: string | null
          proximo_envio: string | null
          reenviar: number | null
          responsavel_id: string | null
          responsavel_nome: string | null
          status: string | null
          texto_ia: string | null
          total_contatos: number | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          chip_id?: string | null
          created_at?: string | null
          enviados?: number | null
          falhas?: number | null
          ia_ativa?: boolean
          id?: string
          instancia?: string | null
          nome: string
          nozap?: number | null
          proposta_id?: string | null
          proximo_envio?: string | null
          reenviar?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          texto_ia?: string | null
          total_contatos?: number | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          chip_id?: string | null
          created_at?: string | null
          enviados?: number | null
          falhas?: number | null
          ia_ativa?: boolean
          id?: string
          instancia?: string | null
          nome?: string
          nozap?: number | null
          proposta_id?: string | null
          proximo_envio?: string | null
          reenviar?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          texto_ia?: string | null
          total_contatos?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disparos_campanhas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_campanhas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "disparos_campanhas_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_campanhas_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "disparos_campanhas_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_campanhas_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
        ]
      }
      disparos_contatos: {
        Row: {
          campanha_id: string | null
          campanha_proposta_id: string | null
          created_at: string | null
          data_envio: string | null
          data_reenvio: string | null
          disparado_por: string | null
          id: string
          lead_id: string | null
          mensagem_enviada: string | null
          nome: string | null
          status: string | null
          telefone_e164: string | null
          telefone_original: string | null
          tentativas: number | null
          tipo_erro: string | null
          updated_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          created_at?: string | null
          data_envio?: string | null
          data_reenvio?: string | null
          disparado_por?: string | null
          id?: string
          lead_id?: string | null
          mensagem_enviada?: string | null
          nome?: string | null
          status?: string | null
          telefone_e164?: string | null
          telefone_original?: string | null
          tentativas?: number | null
          tipo_erro?: string | null
          updated_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          created_at?: string | null
          data_envio?: string | null
          data_reenvio?: string | null
          disparado_por?: string | null
          id?: string
          lead_id?: string | null
          mensagem_enviada?: string | null
          nome?: string | null
          status?: string | null
          telefone_e164?: string | null
          telefone_original?: string | null
          tentativas?: number | null
          tipo_erro?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disparos_contatos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparos_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_contatos_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_contatos_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "disparos_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      disparos_historico_contatos: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          telefone: string | null
          ultima_campanha: string | null
          ultimo_disparo: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          telefone?: string | null
          ultima_campanha?: string | null
          ultimo_disparo?: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          telefone?: string | null
          ultima_campanha?: string | null
          ultimo_disparo?: string
        }
        Relationships: []
      }
      disparos_ia_logs: {
        Row: {
          campanha_id: string
          contato_id: string | null
          contexto_usado: Json | null
          created_at: string
          gatilho_transferencia: string | null
          id: string
          mensagem_medico: string
          nome_medico: string | null
          resposta_ia: string
          telefone_medico: string
          transferido_humano: boolean
        }
        Insert: {
          campanha_id: string
          contato_id?: string | null
          contexto_usado?: Json | null
          created_at?: string
          gatilho_transferencia?: string | null
          id?: string
          mensagem_medico: string
          nome_medico?: string | null
          resposta_ia: string
          telefone_medico: string
          transferido_humano?: boolean
        }
        Update: {
          campanha_id?: string
          contato_id?: string | null
          contexto_usado?: Json | null
          created_at?: string
          gatilho_transferencia?: string | null
          id?: string
          mensagem_medico?: string
          nome_medico?: string | null
          resposta_ia?: string
          telefone_medico?: string
          transferido_humano?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "disparos_ia_logs_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "disparos_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_ia_logs_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "disparos_contatos"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_log: {
        Row: {
          assunto_email: string | null
          chip_id: string | null
          corpo_email: string | null
          created_at: string | null
          destinatarios: Json | null
          detalhes_falhas: Json | null
          disparo_programado_id: string | null
          enviados: number
          especialidade: string
          estado: string | null
          falhas: number
          id: string
          mensagem: string
          revisado_ia: boolean | null
          tipo_disparo: string | null
          total_destinatarios: number
          usuario_id: string
          usuario_nome: string
        }
        Insert: {
          assunto_email?: string | null
          chip_id?: string | null
          corpo_email?: string | null
          created_at?: string | null
          destinatarios?: Json | null
          detalhes_falhas?: Json | null
          disparo_programado_id?: string | null
          enviados?: number
          especialidade: string
          estado?: string | null
          falhas?: number
          id?: string
          mensagem: string
          revisado_ia?: boolean | null
          tipo_disparo?: string | null
          total_destinatarios?: number
          usuario_id: string
          usuario_nome: string
        }
        Update: {
          assunto_email?: string | null
          chip_id?: string | null
          corpo_email?: string | null
          created_at?: string | null
          destinatarios?: Json | null
          detalhes_falhas?: Json | null
          disparo_programado_id?: string | null
          enviados?: number
          especialidade?: string
          estado?: string | null
          falhas?: number
          id?: string
          mensagem?: string
          revisado_ia?: boolean | null
          tipo_disparo?: string | null
          total_destinatarios?: number
          usuario_id?: string
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_log_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_log_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
          {
            foreignKeyName: "disparos_log_disparo_programado_id_fkey"
            columns: ["disparo_programado_id"]
            isOneToOne: false
            referencedRelation: "disparos_programados"
            referencedColumns: ["id"]
          },
        ]
      }
      disparos_programados: {
        Row: {
          assunto_email: string | null
          chip_id: string | null
          corpo_email: string | null
          created_at: string | null
          data_agendamento: string
          destinatarios_enviados: Json | null
          detalhes_erro: string | null
          enviados: number | null
          especialidade: string
          estado: string | null
          falhas: number | null
          id: string
          mensagem: string
          status: string
          tamanho_lote: number | null
          tipo_disparo: string | null
          total_destinatarios: number | null
          updated_at: string | null
          usuario_id: string
        }
        Insert: {
          assunto_email?: string | null
          chip_id?: string | null
          corpo_email?: string | null
          created_at?: string | null
          data_agendamento: string
          destinatarios_enviados?: Json | null
          detalhes_erro?: string | null
          enviados?: number | null
          especialidade: string
          estado?: string | null
          falhas?: number | null
          id?: string
          mensagem: string
          status?: string
          tamanho_lote?: number | null
          tipo_disparo?: string | null
          total_destinatarios?: number | null
          updated_at?: string | null
          usuario_id: string
        }
        Update: {
          assunto_email?: string | null
          chip_id?: string | null
          corpo_email?: string | null
          created_at?: string | null
          data_agendamento?: string
          destinatarios_enviados?: Json | null
          detalhes_erro?: string | null
          enviados?: number | null
          especialidade?: string
          estado?: string | null
          falhas?: number | null
          id?: string
          mensagem?: string
          status?: string
          tamanho_lote?: number | null
          tipo_disparo?: string | null
          total_destinatarios?: number | null
          updated_at?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "disparos_programados_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disparos_programados_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
        ]
      }
      effect_sync_logs: {
        Row: {
          created_at: string | null
          detalhes: Json | null
          effect_id: string | null
          erro: string | null
          id: string
          licitacao_codigo: string | null
          licitacao_id: string | null
          tipo: string
          updated_at: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string | null
          detalhes?: Json | null
          effect_id?: string | null
          erro?: string | null
          id?: string
          licitacao_codigo?: string | null
          licitacao_id?: string | null
          tipo: string
          updated_at?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string | null
          detalhes?: Json | null
          effect_id?: string | null
          erro?: string | null
          id?: string
          licitacao_codigo?: string | null
          licitacao_id?: string | null
          tipo?: string
          updated_at?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "effect_sync_logs_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campanhas: {
        Row: {
          assunto_email: string | null
          ativo: boolean | null
          created_at: string | null
          enviados: number | null
          falhas: number | null
          id: string
          nome: string
          proposta_id: string | null
          respondidos: number | null
          responsavel_id: string | null
          responsavel_nome: string | null
          status: string | null
          texto_ia: string | null
          total_contatos: number | null
          updated_at: string | null
        }
        Insert: {
          assunto_email?: string | null
          ativo?: boolean | null
          created_at?: string | null
          enviados?: number | null
          falhas?: number | null
          id?: string
          nome: string
          proposta_id?: string | null
          respondidos?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          texto_ia?: string | null
          total_contatos?: number | null
          updated_at?: string | null
        }
        Update: {
          assunto_email?: string | null
          ativo?: boolean | null
          created_at?: string | null
          enviados?: number | null
          falhas?: number | null
          id?: string
          nome?: string
          proposta_id?: string | null
          respondidos?: number | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string | null
          texto_ia?: string | null
          total_contatos?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_campanhas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contatos: {
        Row: {
          campanha_id: string
          created_at: string | null
          data_envio: string | null
          data_resposta: string | null
          email: string
          erro: string | null
          especialidade: string | null
          id: string
          lead_id: string | null
          nome: string | null
          status: string | null
          uf: string | null
        }
        Insert: {
          campanha_id: string
          created_at?: string | null
          data_envio?: string | null
          data_resposta?: string | null
          email: string
          erro?: string | null
          especialidade?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          status?: string | null
          uf?: string | null
        }
        Update: {
          campanha_id?: string
          created_at?: string | null
          data_envio?: string | null
          data_resposta?: string | null
          email?: string
          erro?: string | null
          especialidade?: string | null
          id?: string
          lead_id?: string | null
          nome?: string | null
          status?: string | null
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_contatos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "email_campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      email_interacoes: {
        Row: {
          assunto: string | null
          corpo: string
          corpo_html: string | null
          created_at: string
          direcao: string
          email_destino: string
          enviado_por: string | null
          enviado_por_nome: string | null
          id: string
          in_reply_to: string | null
          lead_id: string | null
          message_id: string | null
          nome_destino: string | null
          proposta_id: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          assunto?: string | null
          corpo: string
          corpo_html?: string | null
          created_at?: string
          direcao: string
          email_destino: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          nome_destino?: string | null
          proposta_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          assunto?: string | null
          corpo?: string
          corpo_html?: string | null
          created_at?: string
          direcao?: string
          email_destino?: string
          enviado_por?: string | null
          enviado_por_nome?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          nome_destino?: string | null
          proposta_id?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "email_interacoes_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
      email_respostas: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          conteudo_resposta: string
          created_at: string
          data_resposta: string
          disparo_log_id: string | null
          disparo_programado_id: string | null
          especialidade: string | null
          id: string
          localidade: string | null
          medico_id: string | null
          observacoes: string | null
          remetente_email: string
          remetente_nome: string | null
          status_lead: string
          updated_at: string
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          conteudo_resposta: string
          created_at?: string
          data_resposta?: string
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          especialidade?: string | null
          id?: string
          localidade?: string | null
          medico_id?: string | null
          observacoes?: string | null
          remetente_email: string
          remetente_nome?: string | null
          status_lead?: string
          updated_at?: string
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          conteudo_resposta?: string
          created_at?: string
          data_resposta?: string
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          especialidade?: string | null
          id?: string
          localidade?: string | null
          medico_id?: string | null
          observacoes?: string | null
          remetente_email?: string
          remetente_nome?: string | null
          status_lead?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_respostas_disparo_log_id_fkey"
            columns: ["disparo_log_id"]
            isOneToOne: false
            referencedRelation: "disparos_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_respostas_disparo_programado_id_fkey"
            columns: ["disparo_programado_id"]
            isOneToOne: false
            referencedRelation: "disparos_programados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_respostas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas_concorrentes: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          regiao_atuacao: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          regiao_atuacao?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          regiao_atuacao?: string | null
          updated_at?: string
        }
        Relationships: []
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
      escalas_alertas: {
        Row: {
          criado_em: string | null
          data_referencia: string | null
          descricao: string | null
          id: string
          lido: boolean | null
          lido_em: string | null
          lido_por: string | null
          local_id: string | null
          prioridade: string | null
          setor_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          criado_em?: string | null
          data_referencia?: string | null
          descricao?: string | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          lido_por?: string | null
          local_id?: string | null
          prioridade?: string | null
          setor_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          criado_em?: string | null
          data_referencia?: string | null
          descricao?: string | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          lido_por?: string | null
          local_id?: string | null
          prioridade?: string | null
          setor_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_alertas_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "escalas_locais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_alertas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "escalas_setores"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_ambulatoriais: {
        Row: {
          celula_referencia: string | null
          cliente_id: string | null
          cliente_nome: string
          created_at: string
          data_escala: string
          descricao: string | null
          fonte_id: string
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          nome_aba: string | null
          origem: string
          recurso: string
          sincronizado_em: string
          turno: string | null
          updated_at: string
          url_planilha: string | null
        }
        Insert: {
          celula_referencia?: string | null
          cliente_id?: string | null
          cliente_nome: string
          created_at?: string
          data_escala: string
          descricao?: string | null
          fonte_id: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          nome_aba?: string | null
          origem?: string
          recurso: string
          sincronizado_em?: string
          turno?: string | null
          updated_at?: string
          url_planilha?: string | null
        }
        Update: {
          celula_referencia?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          created_at?: string
          data_escala?: string
          descricao?: string | null
          fonte_id?: string
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          nome_aba?: string | null
          origem?: string
          recurso?: string
          sincronizado_em?: string
          turno?: string | null
          updated_at?: string
          url_planilha?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalas_ambulatoriais_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_ambulatoriais_fonte_id_fkey"
            columns: ["fonte_id"]
            isOneToOne: false
            referencedRelation: "escalas_ambulatoriais_fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_ambulatoriais_fontes: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          cliente_nome: string
          created_at: string
          created_by: string | null
          frequencia_sincronizacao: string
          id: string
          nome_aba: string
          observacoes: string | null
          template_id: string | null
          tipo_fonte: string
          ultima_sincronizacao: string | null
          updated_at: string
          url_planilha: string
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          cliente_nome: string
          created_at?: string
          created_by?: string | null
          frequencia_sincronizacao?: string
          id?: string
          nome_aba: string
          observacoes?: string | null
          template_id?: string | null
          tipo_fonte?: string
          ultima_sincronizacao?: string | null
          updated_at?: string
          url_planilha: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          cliente_nome?: string
          created_at?: string
          created_by?: string | null
          frequencia_sincronizacao?: string
          id?: string
          nome_aba?: string
          observacoes?: string | null
          template_id?: string | null
          tipo_fonte?: string
          ultima_sincronizacao?: string | null
          updated_at?: string
          url_planilha?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_ambulatoriais_fontes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_ambulatoriais_fontes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "escalas_ambulatoriais_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_ambulatoriais_logs: {
        Row: {
          data_sincronizacao: string
          duracao_ms: number | null
          erros_detalhes: Json | null
          fonte_id: string | null
          fonte_nome: string | null
          id: string
          status: string
          total_erros: number | null
          total_registros_atualizados: number | null
          total_registros_inseridos: number | null
          total_registros_lidos: number | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          data_sincronizacao?: string
          duracao_ms?: number | null
          erros_detalhes?: Json | null
          fonte_id?: string | null
          fonte_nome?: string | null
          id?: string
          status?: string
          total_erros?: number | null
          total_registros_atualizados?: number | null
          total_registros_inseridos?: number | null
          total_registros_lidos?: number | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          data_sincronizacao?: string
          duracao_ms?: number | null
          erros_detalhes?: Json | null
          fonte_id?: string | null
          fonte_nome?: string | null
          id?: string
          status?: string
          total_erros?: number | null
          total_registros_atualizados?: number | null
          total_registros_inseridos?: number | null
          total_registros_lidos?: number | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalas_ambulatoriais_logs_fonte_id_fkey"
            columns: ["fonte_id"]
            isOneToOne: false
            referencedRelation: "escalas_ambulatoriais_fontes"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_ambulatoriais_templates: {
        Row: {
          ativo: boolean
          coluna_inicio_dias: string
          coluna_recursos: string
          created_at: string
          created_by: string | null
          descricao: string | null
          formato_data: string | null
          id: string
          ignorar_celulas_vazias: boolean
          linha_cabecalho_dias: number
          linha_inicio_recursos: number
          linha_subcabecalho_turnos: number | null
          nome: string
          turnos_config: Json | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          coluna_inicio_dias?: string
          coluna_recursos?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          formato_data?: string | null
          id?: string
          ignorar_celulas_vazias?: boolean
          linha_cabecalho_dias?: number
          linha_inicio_recursos?: number
          linha_subcabecalho_turnos?: number | null
          nome: string
          turnos_config?: Json | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          coluna_inicio_dias?: string
          coluna_recursos?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          formato_data?: string | null
          id?: string
          ignorar_celulas_vazias?: boolean
          linha_cabecalho_dias?: number
          linha_inicio_recursos?: number
          linha_subcabecalho_turnos?: number | null
          nome?: string
          turnos_config?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      escalas_api_tokens: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          nome: string
          sistema_origem: string
          token: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          nome: string
          sistema_origem?: string
          token: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          nome?: string
          sistema_origem?: string
          token?: string
        }
        Relationships: []
      }
      escalas_inconsistencias: {
        Row: {
          criado_em: string | null
          dados_originais: Json | null
          descricao: string
          escala_id: string | null
          id: string
          resolvido: boolean | null
          resolvido_em: string | null
          tipo: string
        }
        Insert: {
          criado_em?: string | null
          dados_originais?: Json | null
          descricao: string
          escala_id?: string | null
          id?: string
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo: string
        }
        Update: {
          criado_em?: string | null
          dados_originais?: Json | null
          descricao?: string
          escala_id?: string | null
          id?: string
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_inconsistencias_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas_integradas"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas_integracao_logs: {
        Row: {
          arquivo_nome: string | null
          data_sincronizacao: string
          erros_detalhados: Json | null
          id: string
          ip_origem: string | null
          mensagem: string | null
          registros_erro: number | null
          registros_sucesso: number | null
          sistema_origem: string
          status: string
          tipo_operacao: string
          total_registros: number | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          data_sincronizacao?: string
          erros_detalhados?: Json | null
          id?: string
          ip_origem?: string | null
          mensagem?: string | null
          registros_erro?: number | null
          registros_sucesso?: number | null
          sistema_origem: string
          status: string
          tipo_operacao: string
          total_registros?: number | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          data_sincronizacao?: string
          erros_detalhados?: Json | null
          id?: string
          ip_origem?: string | null
          mensagem?: string | null
          registros_erro?: number | null
          registros_sucesso?: number | null
          sistema_origem?: string
          status?: string
          tipo_operacao?: string
          total_registros?: number | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      escalas_integradas: {
        Row: {
          atualizado_em: string
          carga_horaria_minutos: number | null
          cliente_id: string | null
          dados_incompletos: boolean | null
          dados_originais: Json | null
          data_escala: string
          escala_local_id: string | null
          escala_setor_id: string | null
          hora_fim: string
          hora_inicio: string
          id: string
          id_externo: string
          local_id_externo: string | null
          local_nome: string | null
          motivo_incompleto: string | null
          profissional_crm: string | null
          profissional_id_externo: string | null
          profissional_nome: string
          setor: string
          setor_id_externo: string | null
          setor_nome: string | null
          sincronizado_em: string
          sistema_origem: string
          status_escala: string
          tipo_plantao: string | null
          unidade: string | null
          unidade_id: string | null
        }
        Insert: {
          atualizado_em?: string
          carga_horaria_minutos?: number | null
          cliente_id?: string | null
          dados_incompletos?: boolean | null
          dados_originais?: Json | null
          data_escala: string
          escala_local_id?: string | null
          escala_setor_id?: string | null
          hora_fim: string
          hora_inicio: string
          id?: string
          id_externo: string
          local_id_externo?: string | null
          local_nome?: string | null
          motivo_incompleto?: string | null
          profissional_crm?: string | null
          profissional_id_externo?: string | null
          profissional_nome: string
          setor: string
          setor_id_externo?: string | null
          setor_nome?: string | null
          sincronizado_em?: string
          sistema_origem?: string
          status_escala?: string
          tipo_plantao?: string | null
          unidade?: string | null
          unidade_id?: string | null
        }
        Update: {
          atualizado_em?: string
          carga_horaria_minutos?: number | null
          cliente_id?: string | null
          dados_incompletos?: boolean | null
          dados_originais?: Json | null
          data_escala?: string
          escala_local_id?: string | null
          escala_setor_id?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          id_externo?: string
          local_id_externo?: string | null
          local_nome?: string | null
          motivo_incompleto?: string | null
          profissional_crm?: string | null
          profissional_id_externo?: string | null
          profissional_nome?: string
          setor?: string
          setor_id_externo?: string | null
          setor_nome?: string | null
          sincronizado_em?: string
          sistema_origem?: string
          status_escala?: string
          tipo_plantao?: string | null
          unidade?: string | null
          unidade_id?: string | null
        }
        Relationships: []
      }
      escalas_locais: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          cidade: string | null
          endereco: string | null
          id: string
          id_externo: string
          nome: string
          sincronizado_em: string | null
          uf: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cidade?: string | null
          endereco?: string | null
          id?: string
          id_externo: string
          nome: string
          sincronizado_em?: string | null
          uf?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          cidade?: string | null
          endereco?: string | null
          id?: string
          id_externo?: string
          nome?: string
          sincronizado_em?: string | null
          uf?: string | null
        }
        Relationships: []
      }
      escalas_setores: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          id: string
          id_externo: string
          local_id: string
          local_id_externo: string
          nome: string
          sincronizado_em: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          id?: string
          id_externo: string
          local_id: string
          local_id_externo: string
          nome: string
          sincronizado_em?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          id?: string
          id_externo?: string
          local_id?: string
          local_id_externo?: string
          nome?: string
          sincronizado_em?: string | null
        }
        Relationships: []
      }
      especialidades: {
        Row: {
          aliases: string[] | null
          area: string | null
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          aliases?: string[] | null
          area?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          aliases?: string[] | null
          area?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      eventos: {
        Row: {
          created_at: string | null
          data_evento: string
          id: string
          leads_gerados: number | null
          materiais_usados: string[] | null
          nome: string
          orcamento: number | null
          participantes: string[] | null
          pecas_divulgacao: string[] | null
          relatorio_pos_evento: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_evento: string
          id?: string
          leads_gerados?: number | null
          materiais_usados?: string[] | null
          nome: string
          orcamento?: number | null
          participantes?: string[] | null
          pecas_divulgacao?: string[] | null
          relatorio_pos_evento?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_evento?: string
          id?: string
          leads_gerados?: number | null
          materiais_usados?: string[] | null
          nome?: string
          orcamento?: number | null
          participantes?: string[] | null
          pecas_divulgacao?: string[] | null
          relatorio_pos_evento?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financeiro_config_valores: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string
          id: string
          setor: string | null
          tipo_plantao: string | null
          unidade_id: string | null
          updated_at: string
          valor_hora: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao: string
          id?: string
          setor?: string | null
          tipo_plantao?: string | null
          unidade_id?: string | null
          updated_at?: string
          valor_hora?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string
          id?: string
          setor?: string | null
          tipo_plantao?: string | null
          unidade_id?: string | null
          updated_at?: string
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_config_valores_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagamento_itens: {
        Row: {
          carga_horaria_minutos: number | null
          created_at: string
          data_plantao: string
          escala_integrada_id: string | null
          hora_fim: string
          hora_inicio: string
          id: string
          local_nome: string | null
          pagamento_id: string
          setor: string | null
          valor_hora: number
          valor_total: number
        }
        Insert: {
          carga_horaria_minutos?: number | null
          created_at?: string
          data_plantao: string
          escala_integrada_id?: string | null
          hora_fim: string
          hora_inicio: string
          id?: string
          local_nome?: string | null
          pagamento_id: string
          setor?: string | null
          valor_hora?: number
          valor_total?: number
        }
        Update: {
          carga_horaria_minutos?: number | null
          created_at?: string
          data_plantao?: string
          escala_integrada_id?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          local_nome?: string | null
          pagamento_id?: string
          setor?: string | null
          valor_hora?: number
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "financeiro_pagamento_itens_escala_integrada_id_fkey"
            columns: ["escala_integrada_id"]
            isOneToOne: false
            referencedRelation: "escalas_integradas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financeiro_pagamento_itens_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "financeiro_pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      financeiro_pagamentos: {
        Row: {
          ano_referencia: number
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          gerado_por: string | null
          id: string
          integration_id: string | null
          mes_referencia: number
          observacoes: string | null
          profissional_crm: string | null
          profissional_id_externo: string | null
          profissional_nome: string
          status: string
          total_horas_minutos: number
          total_plantoes: number
          unidade: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          ano_referencia: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          gerado_por?: string | null
          id?: string
          integration_id?: string | null
          mes_referencia: number
          observacoes?: string | null
          profissional_crm?: string | null
          profissional_id_externo?: string | null
          profissional_nome: string
          status?: string
          total_horas_minutos?: number
          total_plantoes?: number
          unidade?: string | null
          updated_at?: string
          valor_total?: number
        }
        Update: {
          ano_referencia?: number
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          gerado_por?: string | null
          id?: string
          integration_id?: string | null
          mes_referencia?: number
          observacoes?: string | null
          profissional_crm?: string | null
          profissional_id_externo?: string | null
          profissional_nome?: string
          status?: string
          total_horas_minutos?: number
          total_plantoes?: number
          unidade?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: []
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
      import_leads_failed_queue: {
        Row: {
          abandonment_reason: string | null
          attempts: number
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          lead_id: string | null
          next_retry_at: string
          payload: Json
          resolved_at: string | null
          status: string
        }
        Insert: {
          abandonment_reason?: string | null
          attempts?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          next_retry_at?: string
          payload: Json
          resolved_at?: string | null
          status?: string
        }
        Update: {
          abandonment_reason?: string | null
          attempts?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          next_retry_at?: string
          payload?: Json
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_leads_failed_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_leads_failed_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_leads_failed_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      instance_proxy_settings: {
        Row: {
          created_at: string | null
          enabled: boolean
          host: string | null
          id: string
          instance_id: string
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          password: string | null
          port: number | null
          protocol: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          host?: string | null
          id?: string
          instance_id: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          password?: string | null
          port?: number | null
          protocol?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          host?: string | null
          id?: string
          instance_id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          password?: string | null
          port?: number | null
          protocol?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instance_proxy_settings_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_proxy_settings_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
        ]
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
          updated_at: string | null
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
          updated_at?: string | null
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
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_tamanho: number | null
          arquivo_tipo: string | null
          arquivo_url: string
          created_at: string
          data_validade: string | null
          id: string
          lead_id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_tamanho?: number | null
          arquivo_tipo?: string | null
          arquivo_url: string
          created_at?: string
          data_validade?: string | null
          id?: string
          lead_id: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_tamanho?: number | null
          arquivo_tipo?: string | null
          arquivo_url?: string
          created_at?: string
          data_validade?: string | null
          id?: string
          lead_id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_anexos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_anexos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_anexos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_anotacoes: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          imagens: string[] | null
          lead_id: string
          metadados: Json | null
          tipo: string
          titulo: string | null
          updated_at: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          imagens?: string[] | null
          lead_id: string
          metadados?: Json | null
          tipo?: string
          titulo?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          imagens?: string[] | null
          lead_id?: string
          metadados?: Json | null
          tipo?: string
          titulo?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_anotacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_anotacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_anotacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_contatos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          instance_detectada: string | null
          is_primary: boolean
          lead_id: string
          origem: string | null
          primeiro_contato_em: string | null
          tipo: string
          ultimo_contato_em: string | null
          valor: string
          verified: boolean
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          instance_detectada?: string | null
          is_primary?: boolean
          lead_id: string
          origem?: string | null
          primeiro_contato_em?: string | null
          tipo: string
          ultimo_contato_em?: string | null
          valor: string
          verified?: boolean
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          instance_detectada?: string | null
          is_primary?: boolean
          lead_id?: string
          origem?: string | null
          primeiro_contato_em?: string | null
          tipo?: string
          ultimo_contato_em?: string | null
          valor?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "lead_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contatos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_enrichments: {
        Row: {
          attempt_count: number | null
          completed_at: string | null
          created_at: string | null
          enrich_five: boolean
          enrich_four: boolean
          enrich_one: boolean
          enrich_three: boolean
          enrich_two: boolean
          enriched_at: string | null
          error_message: string | null
          expires_at: string | null
          expires_at_five: string | null
          expires_at_four: string | null
          expires_at_one: string | null
          expires_at_three: string | null
          expires_at_two: string | null
          id: string
          last_attempt_at: string | null
          last_attempt_at_five: string | null
          last_attempt_at_four: string | null
          last_attempt_at_one: string | null
          last_attempt_at_three: string | null
          last_attempt_at_two: string | null
          lead_id: string
          pipeline_version: string | null
          result_data: Json | null
          source: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          enrich_five?: boolean
          enrich_four?: boolean
          enrich_one?: boolean
          enrich_three?: boolean
          enrich_two?: boolean
          enriched_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          expires_at_five?: string | null
          expires_at_four?: string | null
          expires_at_one?: string | null
          expires_at_three?: string | null
          expires_at_two?: string | null
          id?: string
          last_attempt_at?: string | null
          last_attempt_at_five?: string | null
          last_attempt_at_four?: string | null
          last_attempt_at_one?: string | null
          last_attempt_at_three?: string | null
          last_attempt_at_two?: string | null
          lead_id: string
          pipeline_version?: string | null
          result_data?: Json | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          enrich_five?: boolean
          enrich_four?: boolean
          enrich_one?: boolean
          enrich_three?: boolean
          enrich_two?: boolean
          enriched_at?: string | null
          error_message?: string | null
          expires_at?: string | null
          expires_at_five?: string | null
          expires_at_four?: string | null
          expires_at_one?: string | null
          expires_at_three?: string | null
          expires_at_two?: string | null
          id?: string
          last_attempt_at?: string | null
          last_attempt_at_five?: string | null
          last_attempt_at_four?: string | null
          last_attempt_at_one?: string | null
          last_attempt_at_three?: string | null
          last_attempt_at_two?: string | null
          lead_id?: string
          pipeline_version?: string | null
          result_data?: Json | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_enrichments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_enrichments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_enrichments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_especialidades: {
        Row: {
          created_at: string | null
          especialidade_id: string
          fonte: string | null
          id: string
          lead_id: string
          rqe: string | null
        }
        Insert: {
          created_at?: string | null
          especialidade_id: string
          fonte?: string | null
          id?: string
          lead_id: string
          rqe?: string | null
        }
        Update: {
          created_at?: string | null
          especialidade_id?: string
          fonte?: string | null
          id?: string
          lead_id?: string
          rqe?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_especialidades_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_especialidades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_especialidades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_especialidades_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_historico: {
        Row: {
          contrato_id: string | null
          criado_em: string
          descricao_resumida: string
          disparo_log_id: string | null
          disparo_programado_id: string | null
          id: string
          lead_id: string
          licitacao_id: string | null
          medico_id: string | null
          metadados: Json | null
          proposta_id: string | null
          servico_id: string | null
          tipo_evento: Database["public"]["Enums"]["tipo_evento_lead"]
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          contrato_id?: string | null
          criado_em?: string
          descricao_resumida: string
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          id?: string
          lead_id: string
          licitacao_id?: string | null
          medico_id?: string | null
          metadados?: Json | null
          proposta_id?: string | null
          servico_id?: string | null
          tipo_evento: Database["public"]["Enums"]["tipo_evento_lead"]
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          contrato_id?: string | null
          criado_em?: string
          descricao_resumida?: string
          disparo_log_id?: string | null
          disparo_programado_id?: string | null
          id?: string
          lead_id?: string
          licitacao_id?: string | null
          medico_id?: string | null
          metadados?: Json | null
          proposta_id?: string | null
          servico_id?: string | null
          tipo_evento?: Database["public"]["Enums"]["tipo_evento_lead"]
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_historico_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_disparo_log_id_fkey"
            columns: ["disparo_log_id"]
            isOneToOne: false
            referencedRelation: "disparos_log"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_disparo_programado_id_fkey"
            columns: ["disparo_programado_id"]
            isOneToOne: false
            referencedRelation: "disparos_programados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "lead_historico_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_historico_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servico"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_historico_visualizacoes: {
        Row: {
          entry_id: string
          entry_source: string
          id: string
          lead_id: string
          user_id: string
          user_nome: string
          visualizado_em: string
        }
        Insert: {
          entry_id: string
          entry_source: string
          id?: string
          lead_id: string
          user_id: string
          user_nome: string
          visualizado_em?: string
        }
        Update: {
          entry_id?: string
          entry_source?: string
          id?: string
          lead_id?: string
          user_id?: string
          user_nome?: string
          visualizado_em?: string
        }
        Relationships: []
      }
      lead_import_jobs: {
        Row: {
          arquivo_nome: string
          arquivo_storage_path: string | null
          arquivo_url: string | null
          atualizados: number | null
          chunk_atual: number | null
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          erros: Json | null
          finished_at: string | null
          id: string
          ignorados: number | null
          inseridos: number | null
          linhas_processadas: number | null
          mapeamento_colunas: Json | null
          started_at: string | null
          status: string
          total_chunks: number | null
          total_linhas: number | null
          updated_at: string
        }
        Insert: {
          arquivo_nome: string
          arquivo_storage_path?: string | null
          arquivo_url?: string | null
          atualizados?: number | null
          chunk_atual?: number | null
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          erros?: Json | null
          finished_at?: string | null
          id?: string
          ignorados?: number | null
          inseridos?: number | null
          linhas_processadas?: number | null
          mapeamento_colunas?: Json | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          total_linhas?: number | null
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string
          arquivo_storage_path?: string | null
          arquivo_url?: string | null
          atualizados?: number | null
          chunk_atual?: number | null
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          erros?: Json | null
          finished_at?: string | null
          id?: string
          ignorados?: number | null
          inseridos?: number | null
          linhas_processadas?: number | null
          mapeamento_colunas?: Json | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          total_linhas?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_liberacoes: {
        Row: {
          campanha_proposta_id: string
          created_at: string
          id: string
          justificativa: string
          lead_id: string
          liberado_por: string | null
          liberado_por_nome: string | null
          motivo_anterior: string | null
        }
        Insert: {
          campanha_proposta_id: string
          created_at?: string
          id?: string
          justificativa: string
          lead_id: string
          liberado_por?: string | null
          liberado_por_nome?: string | null
          motivo_anterior?: string | null
        }
        Update: {
          campanha_proposta_id?: string
          created_at?: string
          id?: string
          justificativa?: string
          lead_id?: string
          liberado_por?: string | null
          liberado_por_nome?: string | null
          motivo_anterior?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_liberacoes_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_liberacoes_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "lead_liberacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_liberacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_liberacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      lead_merge_log: {
        Row: {
          executado_em: string | null
          id: number
          lead_id_anterior: string
          lead_id_novo: string
          merge_batch: string | null
          registro_id: string
          tabela: string
        }
        Insert: {
          executado_em?: string | null
          id?: number
          lead_id_anterior: string
          lead_id_novo: string
          merge_batch?: string | null
          registro_id: string
          tabela: string
        }
        Update: {
          executado_em?: string | null
          id?: number
          lead_id_anterior?: string
          lead_id_novo?: string
          merge_batch?: string | null
          registro_id?: string
          tabela?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          agencia: string | null
          arquivo_id: string | null
          automacao_status_travada: boolean
          banco: string | null
          canal_conversao: string | null
          cep: string | null
          chave_pix: string | null
          chave_unica: string | null
          cidade: string | null
          classificacao: string
          classificacao_em: string | null
          classificacao_motivo: string | null
          classificacao_por: string | null
          cnpj: string | null
          consent_fonte: string | null
          consent_registrado_em: string | null
          conta_corrente: string | null
          contrato_origem_id: string | null
          convertido_por: string | null
          cooldown_ate: string | null
          cpf: string | null
          created_at: string | null
          crm: string | null
          data_conversao: string | null
          data_formatura: string | null
          data_inicio_contrato: string | null
          data_nascimento: string | null
          email: string | null
          emails_adicionais: string[] | null
          endereco: string | null
          especialidade: string | null
          especialidade_id: string | null
          especialidades: string[] | null
          especialidades_crua: string | null
          especificacoes_contrato: string | null
          estado_civil: string | null
          id: string
          is_trafego_pago: boolean
          licitacao_origem_id: string | null
          local_prestacao_servico: string | null
          merge_reason: string | null
          merged_at: string | null
          merged_into_id: string | null
          migrado_de_medico_em: string | null
          migrado_de_medico_id: string | null
          modalidade_contrato: string | null
          nacionalidade: string | null
          naturalidade: string | null
          nome: string
          observacoes: string | null
          opt_out: boolean
          opt_out_canal: string | null
          opt_out_em: string | null
          opt_out_motivo: string | null
          origem: string | null
          phone_e164: string | null
          rg: string | null
          rqe: string | null
          servico_origem_id: string | null
          status: string
          status_contrato: string | null
          status_medico: string | null
          tags: string[] | null
          telefones_adicionais: string[] | null
          telefones_inativos: string[]
          trafego_pago_campanha_proposta_id: string | null
          trafego_pago_enviado_at: string | null
          trafego_pago_instancia: string | null
          trafego_pago_origem: Json | null
          uf: string | null
          ultima_resposta_em: string | null
          ultimo_disparo_em: string | null
          unidades_vinculadas: string[] | null
          updated_at: string | null
          valor_contrato: number | null
          whatsapp_phones: string[] | null
        }
        Insert: {
          agencia?: string | null
          arquivo_id?: string | null
          automacao_status_travada?: boolean
          banco?: string | null
          canal_conversao?: string | null
          cep?: string | null
          chave_pix?: string | null
          chave_unica?: string | null
          cidade?: string | null
          classificacao?: string
          classificacao_em?: string | null
          classificacao_motivo?: string | null
          classificacao_por?: string | null
          cnpj?: string | null
          consent_fonte?: string | null
          consent_registrado_em?: string | null
          conta_corrente?: string | null
          contrato_origem_id?: string | null
          convertido_por?: string | null
          cooldown_ate?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_conversao?: string | null
          data_formatura?: string | null
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          emails_adicionais?: string[] | null
          endereco?: string | null
          especialidade?: string | null
          especialidade_id?: string | null
          especialidades?: string[] | null
          especialidades_crua?: string | null
          especificacoes_contrato?: string | null
          estado_civil?: string | null
          id?: string
          is_trafego_pago?: boolean
          licitacao_origem_id?: string | null
          local_prestacao_servico?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_into_id?: string | null
          migrado_de_medico_em?: string | null
          migrado_de_medico_id?: string | null
          modalidade_contrato?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome: string
          observacoes?: string | null
          opt_out?: boolean
          opt_out_canal?: string | null
          opt_out_em?: string | null
          opt_out_motivo?: string | null
          origem?: string | null
          phone_e164?: string | null
          rg?: string | null
          rqe?: string | null
          servico_origem_id?: string | null
          status?: string
          status_contrato?: string | null
          status_medico?: string | null
          tags?: string[] | null
          telefones_adicionais?: string[] | null
          telefones_inativos?: string[]
          trafego_pago_campanha_proposta_id?: string | null
          trafego_pago_enviado_at?: string | null
          trafego_pago_instancia?: string | null
          trafego_pago_origem?: Json | null
          uf?: string | null
          ultima_resposta_em?: string | null
          ultimo_disparo_em?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string | null
          valor_contrato?: number | null
          whatsapp_phones?: string[] | null
        }
        Update: {
          agencia?: string | null
          arquivo_id?: string | null
          automacao_status_travada?: boolean
          banco?: string | null
          canal_conversao?: string | null
          cep?: string | null
          chave_pix?: string | null
          chave_unica?: string | null
          cidade?: string | null
          classificacao?: string
          classificacao_em?: string | null
          classificacao_motivo?: string | null
          classificacao_por?: string | null
          cnpj?: string | null
          consent_fonte?: string | null
          consent_registrado_em?: string | null
          conta_corrente?: string | null
          contrato_origem_id?: string | null
          convertido_por?: string | null
          cooldown_ate?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_conversao?: string | null
          data_formatura?: string | null
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          emails_adicionais?: string[] | null
          endereco?: string | null
          especialidade?: string | null
          especialidade_id?: string | null
          especialidades?: string[] | null
          especialidades_crua?: string | null
          especificacoes_contrato?: string | null
          estado_civil?: string | null
          id?: string
          is_trafego_pago?: boolean
          licitacao_origem_id?: string | null
          local_prestacao_servico?: string | null
          merge_reason?: string | null
          merged_at?: string | null
          merged_into_id?: string | null
          migrado_de_medico_em?: string | null
          migrado_de_medico_id?: string | null
          modalidade_contrato?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome?: string
          observacoes?: string | null
          opt_out?: boolean
          opt_out_canal?: string | null
          opt_out_em?: string | null
          opt_out_motivo?: string | null
          origem?: string | null
          phone_e164?: string | null
          rg?: string | null
          rqe?: string | null
          servico_origem_id?: string | null
          status?: string
          status_contrato?: string | null
          status_medico?: string | null
          tags?: string[] | null
          telefones_adicionais?: string[] | null
          telefones_inativos?: string[]
          trafego_pago_campanha_proposta_id?: string | null
          trafego_pago_enviado_at?: string | null
          trafego_pago_instancia?: string | null
          trafego_pago_origem?: Json | null
          uf?: string | null
          ultima_resposta_em?: string | null
          ultimo_disparo_em?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string | null
          valor_contrato?: number | null
          whatsapp_phones?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contrato_origem_id_fkey"
            columns: ["contrato_origem_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_especialidade_id_fkey"
            columns: ["especialidade_id"]
            isOneToOne: false
            referencedRelation: "especialidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_licitacao_origem_id_fkey"
            columns: ["licitacao_origem_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "leads_servico_origem_id_fkey"
            columns: ["servico_origem_id"]
            isOneToOne: false
            referencedRelation: "servico"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_backup_predup: {
        Row: {
          agencia: string | null
          api_enrich_last_attempt: string | null
          api_enrich_source: string | null
          api_enrich_status: string | null
          arquivo_id: string | null
          banco: string | null
          canal_conversao: string | null
          cep: string | null
          chave_pix: string | null
          chave_unica: string | null
          cidade: string | null
          cnpj: string | null
          conta_corrente: string | null
          contrato_origem_id: string | null
          convertido_por: string | null
          cpf: string | null
          created_at: string | null
          crm: string | null
          data_conversao: string | null
          data_formatura: string | null
          data_inicio_contrato: string | null
          data_nascimento: string | null
          email: string | null
          emails_adicionais: string[] | null
          endereco: string | null
          especialidade: string | null
          especialidade_id: string | null
          especialidades: string[] | null
          especialidades_crua: string | null
          especificacoes_contrato: string | null
          estado_civil: string | null
          id: string | null
          licitacao_origem_id: string | null
          local_prestacao_servico: string | null
          migrado_de_medico_em: string | null
          migrado_de_medico_id: string | null
          modalidade_contrato: string | null
          nacionalidade: string | null
          naturalidade: string | null
          nome: string | null
          observacoes: string | null
          origem: string | null
          phone_e164: string | null
          rg: string | null
          rqe: string | null
          servico_origem_id: string | null
          status: string | null
          status_contrato: string | null
          status_medico: string | null
          tags: string[] | null
          telefones_adicionais: string[] | null
          uf: string | null
          ultimo_disparo_em: string | null
          unidades_vinculadas: string[] | null
          updated_at: string | null
          valor_contrato: number | null
          whatsapp_phones: string[] | null
        }
        Insert: {
          agencia?: string | null
          api_enrich_last_attempt?: string | null
          api_enrich_source?: string | null
          api_enrich_status?: string | null
          arquivo_id?: string | null
          banco?: string | null
          canal_conversao?: string | null
          cep?: string | null
          chave_pix?: string | null
          chave_unica?: string | null
          cidade?: string | null
          cnpj?: string | null
          conta_corrente?: string | null
          contrato_origem_id?: string | null
          convertido_por?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_conversao?: string | null
          data_formatura?: string | null
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          emails_adicionais?: string[] | null
          endereco?: string | null
          especialidade?: string | null
          especialidade_id?: string | null
          especialidades?: string[] | null
          especialidades_crua?: string | null
          especificacoes_contrato?: string | null
          estado_civil?: string | null
          id?: string | null
          licitacao_origem_id?: string | null
          local_prestacao_servico?: string | null
          migrado_de_medico_em?: string | null
          migrado_de_medico_id?: string | null
          modalidade_contrato?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          phone_e164?: string | null
          rg?: string | null
          rqe?: string | null
          servico_origem_id?: string | null
          status?: string | null
          status_contrato?: string | null
          status_medico?: string | null
          tags?: string[] | null
          telefones_adicionais?: string[] | null
          uf?: string | null
          ultimo_disparo_em?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string | null
          valor_contrato?: number | null
          whatsapp_phones?: string[] | null
        }
        Update: {
          agencia?: string | null
          api_enrich_last_attempt?: string | null
          api_enrich_source?: string | null
          api_enrich_status?: string | null
          arquivo_id?: string | null
          banco?: string | null
          canal_conversao?: string | null
          cep?: string | null
          chave_pix?: string | null
          chave_unica?: string | null
          cidade?: string | null
          cnpj?: string | null
          conta_corrente?: string | null
          contrato_origem_id?: string | null
          convertido_por?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string | null
          data_conversao?: string | null
          data_formatura?: string | null
          data_inicio_contrato?: string | null
          data_nascimento?: string | null
          email?: string | null
          emails_adicionais?: string[] | null
          endereco?: string | null
          especialidade?: string | null
          especialidade_id?: string | null
          especialidades?: string[] | null
          especialidades_crua?: string | null
          especificacoes_contrato?: string | null
          estado_civil?: string | null
          id?: string | null
          licitacao_origem_id?: string | null
          local_prestacao_servico?: string | null
          migrado_de_medico_em?: string | null
          migrado_de_medico_id?: string | null
          modalidade_contrato?: string | null
          nacionalidade?: string | null
          naturalidade?: string | null
          nome?: string | null
          observacoes?: string | null
          origem?: string | null
          phone_e164?: string | null
          rg?: string | null
          rqe?: string | null
          servico_origem_id?: string | null
          status?: string | null
          status_contrato?: string | null
          status_medico?: string | null
          tags?: string[] | null
          telefones_adicionais?: string[] | null
          uf?: string | null
          ultimo_disparo_em?: string | null
          unidades_vinculadas?: string[] | null
          updated_at?: string | null
          valor_contrato?: number | null
          whatsapp_phones?: string[] | null
        }
        Relationships: []
      }
      leads_bloqueio_temporario: {
        Row: {
          categoria: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          motivo: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          motivo: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          motivo?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_bloqueio_temporario_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_bloqueio_temporario_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_bloqueio_temporario_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      leads_etiquetas_config: {
        Row: {
          cor_id: string
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          cor_id?: string
          created_at?: string | null
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          cor_id?: string
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      licitacao_descartes: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_nome: string | null
          id: string
          justificativa: string
          licitacao_id: string
          modalidade: string | null
          motivo_id: string
          motivo_nome: string | null
          municipio: string | null
          numero_edital: string | null
          objeto: string | null
          orgao: string | null
          uf: string | null
          valor_estimado: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          justificativa: string
          licitacao_id: string
          modalidade?: string | null
          motivo_id: string
          motivo_nome?: string | null
          municipio?: string | null
          numero_edital?: string | null
          objeto?: string | null
          orgao?: string | null
          uf?: string | null
          valor_estimado?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_nome?: string | null
          id?: string
          justificativa?: string
          licitacao_id?: string
          modalidade?: string | null
          motivo_id?: string
          motivo_nome?: string | null
          municipio?: string | null
          numero_edital?: string | null
          objeto?: string | null
          orgao?: string | null
          uf?: string | null
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_descartes_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacao_descartes_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "licitacao_motivos_descarte"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacao_item_concorrentes: {
        Row: {
          created_at: string
          empresa_cnpj: string | null
          empresa_id: string | null
          empresa_nome: string
          id: string
          is_gss: boolean
          is_vencedor: boolean
          item_id: string
          motivo_situacao: string | null
          observacoes: string | null
          posicao: number
          situacao: string
          updated_at: string
          valor_ofertado: number
        }
        Insert: {
          created_at?: string
          empresa_cnpj?: string | null
          empresa_id?: string | null
          empresa_nome: string
          id?: string
          is_gss?: boolean
          is_vencedor?: boolean
          item_id: string
          motivo_situacao?: string | null
          observacoes?: string | null
          posicao?: number
          situacao?: string
          updated_at?: string
          valor_ofertado: number
        }
        Update: {
          created_at?: string
          empresa_cnpj?: string | null
          empresa_id?: string | null
          empresa_nome?: string
          id?: string
          is_gss?: boolean
          is_vencedor?: boolean
          item_id?: string
          motivo_situacao?: string | null
          observacoes?: string | null
          posicao?: number
          situacao?: string
          updated_at?: string
          valor_ofertado?: number
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_item_concorrentes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_concorrentes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacao_itens: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          licitacao_id: string
          nome: string
          quantidade: number | null
          tipo: string
          unidade_medida: string | null
          updated_at: string
          valor_referencia: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          licitacao_id: string
          nome: string
          quantidade?: number | null
          tipo?: string
          unidade_medida?: string | null
          updated_at?: string
          valor_referencia?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          licitacao_id?: string
          nome?: string
          quantidade?: number | null
          tipo?: string
          unidade_medida?: string | null
          updated_at?: string
          valor_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_itens_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacao_motivos_descarte: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      licitacao_resultados: {
        Row: {
          classificacao_gss: Database["public"]["Enums"]["classificacao_gss_licitacao"]
          created_at: string
          empresa_vencedora_id: string | null
          empresa_vencedora_nome: string
          id: string
          licitacao_id: string
          motivo_perda:
            | Database["public"]["Enums"]["motivo_perda_licitacao"]
            | null
          observacoes_estrategicas: string | null
          registrado_por: string | null
          registrado_por_nome: string | null
          updated_at: string
          valor_homologado: number
        }
        Insert: {
          classificacao_gss: Database["public"]["Enums"]["classificacao_gss_licitacao"]
          created_at?: string
          empresa_vencedora_id?: string | null
          empresa_vencedora_nome: string
          id?: string
          licitacao_id: string
          motivo_perda?:
            | Database["public"]["Enums"]["motivo_perda_licitacao"]
            | null
          observacoes_estrategicas?: string | null
          registrado_por?: string | null
          registrado_por_nome?: string | null
          updated_at?: string
          valor_homologado: number
        }
        Update: {
          classificacao_gss?: Database["public"]["Enums"]["classificacao_gss_licitacao"]
          created_at?: string
          empresa_vencedora_id?: string | null
          empresa_vencedora_nome?: string
          id?: string
          licitacao_id?: string
          motivo_perda?:
            | Database["public"]["Enums"]["motivo_perda_licitacao"]
            | null
          observacoes_estrategicas?: string | null
          registrado_por?: string | null
          registrado_por_nome?: string | null
          updated_at?: string
          valor_homologado?: number
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_resultados_empresa_vencedora_id_fkey"
            columns: ["empresa_vencedora_id"]
            isOneToOne: false
            referencedRelation: "empresas_concorrentes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacao_resultados_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: true
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes: {
        Row: {
          check_conversao_1: boolean | null
          check_conversao_2: boolean | null
          check_conversao_3: boolean | null
          check_documentacao: boolean | null
          check_habilitacao: boolean | null
          check_proposta: boolean | null
          cnpj_orgao: string | null
          created_at: string | null
          dados_customizados: Json | null
          data_abertura: string | null
          data_disputa: string | null
          data_limite: string | null
          effect_id: string | null
          etiquetas: string[] | null
          fonte: string | null
          id: string
          licitacao_codigo: string | null
          municipio_uf: string | null
          numero_edital: string
          objeto: string
          objeto_contrato: string | null
          observacoes: string | null
          orgao: string
          prioridade: string | null
          responsavel_id: string | null
          servicos_contrato: Json | null
          servicos_licitacao: Json | null
          status: Database["public"]["Enums"]["status_licitacao"]
          subtipo_modalidade: string | null
          tem_mensagem_critica_pendente: boolean | null
          tipo_licitacao: string | null
          tipo_modalidade: string | null
          titulo: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Insert: {
          check_conversao_1?: boolean | null
          check_conversao_2?: boolean | null
          check_conversao_3?: boolean | null
          check_documentacao?: boolean | null
          check_habilitacao?: boolean | null
          check_proposta?: boolean | null
          cnpj_orgao?: string | null
          created_at?: string | null
          dados_customizados?: Json | null
          data_abertura?: string | null
          data_disputa?: string | null
          data_limite?: string | null
          effect_id?: string | null
          etiquetas?: string[] | null
          fonte?: string | null
          id?: string
          licitacao_codigo?: string | null
          municipio_uf?: string | null
          numero_edital: string
          objeto: string
          objeto_contrato?: string | null
          observacoes?: string | null
          orgao: string
          prioridade?: string | null
          responsavel_id?: string | null
          servicos_contrato?: Json | null
          servicos_licitacao?: Json | null
          status?: Database["public"]["Enums"]["status_licitacao"]
          subtipo_modalidade?: string | null
          tem_mensagem_critica_pendente?: boolean | null
          tipo_licitacao?: string | null
          tipo_modalidade?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Update: {
          check_conversao_1?: boolean | null
          check_conversao_2?: boolean | null
          check_conversao_3?: boolean | null
          check_documentacao?: boolean | null
          check_habilitacao?: boolean | null
          check_proposta?: boolean | null
          cnpj_orgao?: string | null
          created_at?: string | null
          dados_customizados?: Json | null
          data_abertura?: string | null
          data_disputa?: string | null
          data_limite?: string | null
          effect_id?: string | null
          etiquetas?: string[] | null
          fonte?: string | null
          id?: string
          licitacao_codigo?: string | null
          municipio_uf?: string | null
          numero_edital?: string
          objeto?: string
          objeto_contrato?: string | null
          observacoes?: string | null
          orgao?: string
          prioridade?: string | null
          responsavel_id?: string | null
          servicos_contrato?: Json | null
          servicos_licitacao?: Json | null
          status?: Database["public"]["Enums"]["status_licitacao"]
          subtipo_modalidade?: string | null
          tem_mensagem_critica_pendente?: boolean | null
          tipo_licitacao?: string | null
          tipo_modalidade?: string | null
          titulo?: string | null
          updated_at?: string | null
          valor_estimado?: number | null
        }
        Relationships: []
      }
      licitacoes_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          created_at: string
          id: string
          licitacao_id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          created_at?: string
          id?: string
          licitacao_id: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          created_at?: string
          id?: string
          licitacao_id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_anexos_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes_atividades: {
        Row: {
          campo_alterado: string | null
          created_at: string
          descricao: string
          id: string
          is_critico: boolean | null
          licitacao_id: string
          respondido_em: string | null
          respondido_por: string | null
          responsavel_resposta_id: string | null
          resposta_esperada_ate: string | null
          setor_responsavel: string | null
          tipo: string
          user_id: string | null
          valor_antigo: string | null
          valor_novo: string | null
        }
        Insert: {
          campo_alterado?: string | null
          created_at?: string
          descricao: string
          id?: string
          is_critico?: boolean | null
          licitacao_id: string
          respondido_em?: string | null
          respondido_por?: string | null
          responsavel_resposta_id?: string | null
          resposta_esperada_ate?: string | null
          setor_responsavel?: string | null
          tipo: string
          user_id?: string | null
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Update: {
          campo_alterado?: string | null
          created_at?: string
          descricao?: string
          id?: string
          is_critico?: boolean | null
          licitacao_id?: string
          respondido_em?: string | null
          respondido_por?: string | null
          responsavel_resposta_id?: string | null
          resposta_esperada_ate?: string | null
          setor_responsavel?: string | null
          tipo?: string
          user_id?: string | null
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_atividades_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacoes_atividades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licitacoes_atividades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_produtividade_disparos"
            referencedColumns: ["user_id"]
          },
        ]
      }
      licitacoes_colunas: {
        Row: {
          cor: string
          created_at: string | null
          id: string
          nome: string
          ordem: number
          status_vinculado: Database["public"]["Enums"]["status_licitacao"]
          updated_at: string | null
        }
        Insert: {
          cor: string
          created_at?: string | null
          id?: string
          nome: string
          ordem: number
          status_vinculado: Database["public"]["Enums"]["status_licitacao"]
          updated_at?: string | null
        }
        Update: {
          cor?: string
          created_at?: string | null
          id?: string
          nome?: string
          ordem?: number
          status_vinculado?: Database["public"]["Enums"]["status_licitacao"]
          updated_at?: string | null
        }
        Relationships: []
      }
      licitacoes_edit_locks: {
        Row: {
          expires_at: string
          id: string
          licitacao_id: string
          started_at: string | null
          user_id: string
          user_name: string
        }
        Insert: {
          expires_at: string
          id?: string
          licitacao_id: string
          started_at?: string | null
          user_id: string
          user_name: string
        }
        Update: {
          expires_at?: string
          id?: string
          licitacao_id?: string
          started_at?: string | null
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_edit_locks_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: true
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes_etiquetas_config: {
        Row: {
          cor_id: string
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cor_id?: string
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cor_id?: string
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      licitacoes_notificacoes_prazo: {
        Row: {
          atividade_id: string
          created_at: string
          id: string
          notificado_em: string
          tipo_notificacao: string
          user_id: string | null
        }
        Insert: {
          atividade_id: string
          created_at?: string
          id?: string
          notificado_em?: string
          tipo_notificacao: string
          user_id?: string | null
        }
        Update: {
          atividade_id?: string
          created_at?: string
          id?: string
          notificado_em?: string
          tipo_notificacao?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacoes_notificacoes_prazo_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "licitacoes_atividades"
            referencedColumns: ["id"]
          },
        ]
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
      marketing_contas: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      marketing_conteudos: {
        Row: {
          campanha_id: string | null
          checklist: Json | null
          comentarios_internos: Json | null
          conta_perfil: string | null
          created_at: string | null
          data_publicacao: string | null
          id: string
          legenda: string | null
          materiais: string[] | null
          metricas: Json | null
          objetivo: string | null
          responsavel_id: string | null
          status: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          checklist?: Json | null
          comentarios_internos?: Json | null
          conta_perfil?: string | null
          created_at?: string | null
          data_publicacao?: string | null
          id?: string
          legenda?: string | null
          materiais?: string[] | null
          metricas?: Json | null
          objetivo?: string | null
          responsavel_id?: string | null
          status?: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          checklist?: Json | null
          comentarios_internos?: Json | null
          conta_perfil?: string | null
          created_at?: string | null
          data_publicacao?: string | null
          id?: string
          legenda?: string | null
          materiais?: string[] | null
          metricas?: Json | null
          objetivo?: string | null
          responsavel_id?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_conteudos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_conteudos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      marketing_endomarketing: {
        Row: {
          artes: string[] | null
          campanha_id: string | null
          checklist: Json | null
          created_at: string | null
          data_envio: string | null
          id: string
          nome: string
          objetivo: string | null
          publico_interno: string[] | null
          responsavel_id: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          artes?: string[] | null
          campanha_id?: string | null
          checklist?: Json | null
          created_at?: string | null
          data_envio?: string | null
          id?: string
          nome: string
          objetivo?: string | null
          publico_interno?: string[] | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          artes?: string[] | null
          campanha_id?: string | null
          checklist?: Json | null
          created_at?: string | null
          data_envio?: string | null
          id?: string
          nome?: string
          objetivo?: string | null
          publico_interno?: string[] | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_endomarketing_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_endomarketing_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      marketing_eventos: {
        Row: {
          campanha_id: string | null
          checklist_durante: Json | null
          checklist_pos: Json | null
          checklist_pre: Json | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          fornecedores: Json | null
          id: string
          local: string | null
          materiais: string[] | null
          nome: string
          objetivo: string | null
          orcamentos: Json | null
          responsavel_id: string | null
          status: string
          timeline: Json | null
          tipo_evento: string | null
          updated_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          checklist_durante?: Json | null
          checklist_pos?: Json | null
          checklist_pre?: Json | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          fornecedores?: Json | null
          id?: string
          local?: string | null
          materiais?: string[] | null
          nome: string
          objetivo?: string | null
          orcamentos?: Json | null
          responsavel_id?: string | null
          status?: string
          timeline?: Json | null
          tipo_evento?: string | null
          updated_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          checklist_durante?: Json | null
          checklist_pos?: Json | null
          checklist_pre?: Json | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          fornecedores?: Json | null
          id?: string
          local?: string | null
          materiais?: string[] | null
          nome?: string
          objetivo?: string | null
          orcamentos?: Json | null
          responsavel_id?: string | null
          status?: string
          timeline?: Json | null
          tipo_evento?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_eventos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_eventos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      marketing_ideias: {
        Row: {
          categoria: string
          convertido_para_id: string | null
          convertido_para_tipo: string | null
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          id: string
          referencia_imagem: string | null
          referencia_url: string | null
          status: string
          titulo: string
          updated_at: string | null
        }
        Insert: {
          categoria: string
          convertido_para_id?: string | null
          convertido_para_tipo?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          referencia_imagem?: string | null
          referencia_url?: string | null
          status?: string
          titulo: string
          updated_at?: string | null
        }
        Update: {
          categoria?: string
          convertido_para_id?: string | null
          convertido_para_tipo?: string | null
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          id?: string
          referencia_imagem?: string | null
          referencia_url?: string | null
          status?: string
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      marketing_leads: {
        Row: {
          cidade: string | null
          created_at: string | null
          documentos_url: string[] | null
          email: string | null
          especialidade: string | null
          etapa: Database["public"]["Enums"]["etapa_funil_marketing"]
          historico_interacoes: Json | null
          id: string
          nome: string
          observacoes: string | null
          origem_campanha_id: string | null
          responsavel_id: string | null
          tags: string[] | null
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string | null
          documentos_url?: string[] | null
          email?: string | null
          especialidade?: string | null
          etapa?: Database["public"]["Enums"]["etapa_funil_marketing"]
          historico_interacoes?: Json | null
          id?: string
          nome: string
          observacoes?: string | null
          origem_campanha_id?: string | null
          responsavel_id?: string | null
          tags?: string[] | null
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string | null
          documentos_url?: string[] | null
          email?: string | null
          especialidade?: string | null
          etapa?: Database["public"]["Enums"]["etapa_funil_marketing"]
          historico_interacoes?: Json | null
          id?: string
          nome?: string
          observacoes?: string | null
          origem_campanha_id?: string | null
          responsavel_id?: string | null
          tags?: string[] | null
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_origem_campanha_id_fkey"
            columns: ["origem_campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_origem_campanha_id_fkey"
            columns: ["origem_campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      marketing_planejamentos: {
        Row: {
          campanha_id: string | null
          created_at: string | null
          cronograma: Json | null
          id: string
          materiais_necessarios: string[] | null
          objetivo: string
          publico: string | null
          relatorio_final: string | null
          responsavel_id: string | null
          status: string
          tarefas: Json | null
          updated_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          created_at?: string | null
          cronograma?: Json | null
          id?: string
          materiais_necessarios?: string[] | null
          objetivo: string
          publico?: string | null
          relatorio_final?: string | null
          responsavel_id?: string | null
          status?: string
          tarefas?: Json | null
          updated_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          created_at?: string | null
          cronograma?: Json | null
          id?: string
          materiais_necessarios?: string[] | null
          objetivo?: string
          publico?: string | null
          relatorio_final?: string | null
          responsavel_id?: string | null
          status?: string
          tarefas?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_planejamentos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_planejamentos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      marketing_prioridades: {
        Row: {
          coluna: string
          created_at: string | null
          data_limite: string | null
          descricao: string | null
          id: string
          id_relacionado: string | null
          ordem: number | null
          responsavel_id: string | null
          tipo_relacionado: string | null
          titulo: string
          updated_at: string | null
        }
        Insert: {
          coluna?: string
          created_at?: string | null
          data_limite?: string | null
          descricao?: string | null
          id?: string
          id_relacionado?: string | null
          ordem?: number | null
          responsavel_id?: string | null
          tipo_relacionado?: string | null
          titulo: string
          updated_at?: string | null
        }
        Update: {
          coluna?: string
          created_at?: string | null
          data_limite?: string | null
          descricao?: string | null
          id?: string
          id_relacionado?: string | null
          ordem?: number | null
          responsavel_id?: string | null
          tipo_relacionado?: string | null
          titulo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      marketing_trafego_pago: {
        Row: {
          campanha_id: string | null
          created_at: string | null
          criativos: string[] | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          nome: string
          objetivo: string | null
          orcamento: number | null
          plataforma: string
          publico: string | null
          responsavel_id: string | null
          resultados: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          campanha_id?: string | null
          created_at?: string | null
          criativos?: string[] | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome: string
          objetivo?: string | null
          orcamento?: number | null
          plataforma: string
          publico?: string | null
          responsavel_id?: string | null
          resultados?: Json | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          campanha_id?: string | null
          created_at?: string | null
          criativos?: string[] | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string
          objetivo?: string | null
          orcamento?: number | null
          plataforma?: string
          publico?: string | null
          responsavel_id?: string | null
          resultados?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_trafego_pago_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_trafego_pago_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      materiais_biblioteca: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          categoria: Database["public"]["Enums"]["categoria_material"]
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          pasta: string | null
          tags: string[] | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          categoria: Database["public"]["Enums"]["categoria_material"]
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          pasta?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          categoria?: Database["public"]["Enums"]["categoria_material"]
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          pasta?: string | null
          tags?: string[] | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      medico_ausencias: {
        Row: {
          created_at: string | null
          data_fim: string
          data_inicio: string
          id: string
          medico_id: string
          medico_substituto_id: string | null
          motivo: Database["public"]["Enums"]["motivo_ausencia"]
          observacoes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data_fim: string
          data_inicio: string
          id?: string
          medico_id: string
          medico_substituto_id?: string | null
          motivo: Database["public"]["Enums"]["motivo_ausencia"]
          observacoes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data_fim?: string
          data_inicio?: string
          id?: string
          medico_id?: string
          medico_substituto_id?: string | null
          motivo?: Database["public"]["Enums"]["motivo_ausencia"]
          observacoes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_ausencias_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_ausencias_medico_substituto_id_fkey"
            columns: ["medico_substituto_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_documentos: {
        Row: {
          arquivo_nome: string
          arquivo_path: string
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          emissor: string | null
          id: string
          medico_id: string
          observacoes: string | null
          texto_extraido: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento_medico"]
          updated_at: string
          uploaded_by: string | null
          url_externa: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_path: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          emissor?: string | null
          id?: string
          medico_id: string
          observacoes?: string | null
          texto_extraido?: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento_medico"]
          updated_at?: string
          uploaded_by?: string | null
          url_externa?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_path?: string
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          emissor?: string | null
          id?: string
          medico_id?: string
          observacoes?: string | null
          texto_extraido?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento_medico"]
          updated_at?: string
          uploaded_by?: string | null
          url_externa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_documentos_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_documentos_log: {
        Row: {
          acao: string
          created_at: string
          detalhes: string | null
          documento_id: string | null
          id: string
          medico_id: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          acao: string
          created_at?: string
          detalhes?: string | null
          documento_id?: string | null
          id?: string
          medico_id: string
          usuario_id?: string | null
          usuario_nome: string
        }
        Update: {
          acao?: string
          created_at?: string
          detalhes?: string | null
          documento_id?: string | null
          id?: string
          medico_id?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_documentos_log_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "medico_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_documentos_log_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_indisponibilidades: {
        Row: {
          created_at: string | null
          detalhes: string | null
          fim: string
          id: string
          inicio: string
          medico_id: string
          motivo: Database["public"]["Enums"]["motivo_indisponibilidade"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          detalhes?: string | null
          fim: string
          id?: string
          inicio: string
          medico_id: string
          motivo: Database["public"]["Enums"]["motivo_indisponibilidade"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          detalhes?: string | null
          fim?: string
          id?: string
          inicio?: string
          medico_id?: string
          motivo?: Database["public"]["Enums"]["motivo_indisponibilidade"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_indisponibilidades_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_kanban_card_anexos: {
        Row: {
          arquivo_nome: string
          arquivo_url: string
          card_id: string
          created_at: string
          id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          arquivo_nome: string
          arquivo_url: string
          card_id: string
          created_at?: string
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          arquivo_nome?: string
          arquivo_url?: string
          card_id?: string
          created_at?: string
          id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_kanban_card_anexos_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "medico_kanban_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_kanban_cards: {
        Row: {
          canal_id: string | null
          cpf: string | null
          created_at: string
          crm: string | null
          data_nascimento: string | null
          email: string | null
          etiquetas: string[] | null
          id: string
          medico_id: string | null
          nome: string
          observacoes: string | null
          responsavel_id: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          canal_id?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          data_nascimento?: string | null
          email?: string | null
          etiquetas?: string[] | null
          id?: string
          medico_id?: string | null
          nome: string
          observacoes?: string | null
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          canal_id?: string | null
          cpf?: string | null
          created_at?: string
          crm?: string | null
          data_nascimento?: string | null
          email?: string | null
          etiquetas?: string[] | null
          id?: string
          medico_id?: string | null
          nome?: string
          observacoes?: string | null
          responsavel_id?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_kanban_cards_canal_id_fkey"
            columns: ["canal_id"]
            isOneToOne: false
            referencedRelation: "comunicacao_canais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_kanban_cards_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_prontuario: {
        Row: {
          anotacao: string
          created_at: string
          created_by: string | null
          id: string
          medico_id: string
          updated_at: string
        }
        Insert: {
          anotacao: string
          created_at?: string
          created_by?: string | null
          id?: string
          medico_id: string
          updated_at?: string
        }
        Update: {
          anotacao?: string
          created_at?: string
          created_by?: string | null
          id?: string
          medico_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medico_prontuario_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_remuneracao: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          exame_servico: string
          id: string
          medico_id: string
          observacoes: string | null
          updated_at: string | null
          valor: number
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          exame_servico: string
          id?: string
          medico_id: string
          observacoes?: string | null
          updated_at?: string | null
          valor: number
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          exame_servico?: string
          id?: string
          medico_id?: string
          observacoes?: string | null
          updated_at?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "medico_remuneracao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_remuneracao_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      medico_vinculo_unidade: {
        Row: {
          cliente_id: string
          contrato_id: string | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string | null
          id: string
          medico_id: string
          observacoes: string | null
          status: string | null
          unidade_id: string
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          contrato_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          medico_id: string
          observacoes?: string | null
          status?: string | null
          unidade_id: string
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          contrato_id?: string | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          id?: string
          medico_id?: string
          observacoes?: string | null
          status?: string | null
          unidade_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medico_vinculo_unidade_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_vinculo_unidade_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_vinculo_unidade_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medico_vinculo_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      medicos: {
        Row: {
          alocado_cliente_id: string[] | null
          aprovacao_cadastro_unidade: boolean | null
          aprovacao_contrato_assinado: boolean | null
          aprovacao_documentacao_unidade: boolean | null
          aprovado_corpo_medico_por: string | null
          cliente_vinculado_id: string | null
          cpf: string | null
          created_at: string | null
          crm: string
          data_aprovacao_corpo_medico: string | null
          data_nascimento: string | null
          documentos_url: string[] | null
          email: string
          especialidade: string[] | null
          estado: string | null
          id: string
          lead_id: string | null
          nome_completo: string
          phone_e164: string | null
          resumo_ia: string | null
          resumo_ia_aprovado: boolean | null
          resumo_ia_aprovado_em: string | null
          resumo_ia_aprovado_por: string | null
          resumo_ia_gerado_em: string | null
          resumo_ia_gerado_por: string | null
          rqe_numeros: string[] | null
          status_contrato: string | null
          status_documentacao: Database["public"]["Enums"]["status_documentacao"]
          status_medico: Database["public"]["Enums"]["status_medico"] | null
          telefone: string
          updated_at: string | null
        }
        Insert: {
          alocado_cliente_id?: string[] | null
          aprovacao_cadastro_unidade?: boolean | null
          aprovacao_contrato_assinado?: boolean | null
          aprovacao_documentacao_unidade?: boolean | null
          aprovado_corpo_medico_por?: string | null
          cliente_vinculado_id?: string | null
          cpf?: string | null
          created_at?: string | null
          crm: string
          data_aprovacao_corpo_medico?: string | null
          data_nascimento?: string | null
          documentos_url?: string[] | null
          email: string
          especialidade?: string[] | null
          estado?: string | null
          id?: string
          lead_id?: string | null
          nome_completo: string
          phone_e164?: string | null
          resumo_ia?: string | null
          resumo_ia_aprovado?: boolean | null
          resumo_ia_aprovado_em?: string | null
          resumo_ia_aprovado_por?: string | null
          resumo_ia_gerado_em?: string | null
          resumo_ia_gerado_por?: string | null
          rqe_numeros?: string[] | null
          status_contrato?: string | null
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          status_medico?: Database["public"]["Enums"]["status_medico"] | null
          telefone: string
          updated_at?: string | null
        }
        Update: {
          alocado_cliente_id?: string[] | null
          aprovacao_cadastro_unidade?: boolean | null
          aprovacao_contrato_assinado?: boolean | null
          aprovacao_documentacao_unidade?: boolean | null
          aprovado_corpo_medico_por?: string | null
          cliente_vinculado_id?: string | null
          cpf?: string | null
          created_at?: string | null
          crm?: string
          data_aprovacao_corpo_medico?: string | null
          data_nascimento?: string | null
          documentos_url?: string[] | null
          email?: string
          especialidade?: string[] | null
          estado?: string | null
          id?: string
          lead_id?: string | null
          nome_completo?: string
          phone_e164?: string | null
          resumo_ia?: string | null
          resumo_ia_aprovado?: boolean | null
          resumo_ia_aprovado_em?: string | null
          resumo_ia_aprovado_por?: string | null
          resumo_ia_gerado_em?: string | null
          resumo_ia_gerado_por?: string | null
          rqe_numeros?: string[] | null
          status_contrato?: string | null
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          status_medico?: Database["public"]["Enums"]["status_medico"] | null
          telefone?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicos_cliente_vinculado_id_fkey"
            columns: ["cliente_vinculado_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medicos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      mensagens: {
        Row: {
          conversa_pai: string
          created_at: string | null
          direcao: string
          id: string
          texto_mensagem: string
          timestamp: string
        }
        Insert: {
          conversa_pai: string
          created_at?: string | null
          direcao: string
          id?: string
          texto_mensagem: string
          timestamp: string
        }
        Update: {
          conversa_pai?: string
          created_at?: string | null
          direcao?: string
          id?: string
          texto_mensagem?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_pai_fkey"
            columns: ["conversa_pai"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
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
      merge_plan: {
        Row: {
          canonical_filhos: number | null
          canonical_id: string
          canonical_tem_cpf: boolean | null
          cluster_id: number
          cluster_size: number | null
          duplicate_ids: string[]
          duplicates_filhos: number | null
          match_key: string
          match_type: string
          notes: string | null
          processed_at: string | null
          status: string | null
        }
        Insert: {
          canonical_filhos?: number | null
          canonical_id: string
          canonical_tem_cpf?: boolean | null
          cluster_id?: number
          cluster_size?: number | null
          duplicate_ids: string[]
          duplicates_filhos?: number | null
          match_key: string
          match_type: string
          notes?: string | null
          processed_at?: string | null
          status?: string | null
        }
        Update: {
          canonical_filhos?: number | null
          canonical_id?: string
          canonical_tem_cpf?: boolean | null
          cluster_id?: number
          cluster_size?: number | null
          duplicate_ids?: string[]
          duplicates_filhos?: number | null
          match_key?: string
          match_type?: string
          notes?: string | null
          processed_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      modulos_manutencao: {
        Row: {
          created_at: string
          desativado_por: string | null
          id: string
          modulo_key: string
          motivo: string | null
        }
        Insert: {
          created_at?: string
          desativado_por?: string | null
          id?: string
          modulo_key: string
          motivo?: string | null
        }
        Update: {
          created_at?: string
          desativado_por?: string | null
          id?: string
          modulo_key?: string
          motivo?: string | null
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
      parceiros: {
        Row: {
          cnpj: string | null
          contatos_principais: Json | null
          created_at: string | null
          historico_interacoes: Json | null
          id: string
          materiais_enviados: string[] | null
          nome_empresa: string
          observacoes: string | null
          oportunidades: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          cnpj?: string | null
          contatos_principais?: Json | null
          created_at?: string | null
          historico_interacoes?: Json | null
          id?: string
          materiais_enviados?: string[] | null
          nome_empresa: string
          observacoes?: string | null
          oportunidades?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          cnpj?: string | null
          contatos_principais?: Json | null
          created_at?: string | null
          historico_interacoes?: Json | null
          id?: string
          materiais_enviados?: string[] | null
          nome_empresa?: string
          observacoes?: string | null
          oportunidades?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      patrimonio: {
        Row: {
          categoria: Database["public"]["Enums"]["categoria_patrimonio"]
          codigo_bem: string
          created_at: string | null
          data_aquisicao: string
          descricao: string | null
          documentos_url: string[] | null
          estado_conservacao: Database["public"]["Enums"]["estado_conservacao"]
          fornecedor: string | null
          id: string
          localizacao: string | null
          nome: string
          nota_fiscal: string | null
          numero_serie: string | null
          observacoes: string | null
          responsavel: string | null
          setor: string | null
          setor_id: string | null
          status: Database["public"]["Enums"]["status_patrimonio"]
          updated_at: string | null
          valor_aquisicao: number
          vida_util_anos: number | null
        }
        Insert: {
          categoria: Database["public"]["Enums"]["categoria_patrimonio"]
          codigo_bem: string
          created_at?: string | null
          data_aquisicao: string
          descricao?: string | null
          documentos_url?: string[] | null
          estado_conservacao?: Database["public"]["Enums"]["estado_conservacao"]
          fornecedor?: string | null
          id?: string
          localizacao?: string | null
          nome: string
          nota_fiscal?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          responsavel?: string | null
          setor?: string | null
          setor_id?: string | null
          status?: Database["public"]["Enums"]["status_patrimonio"]
          updated_at?: string | null
          valor_aquisicao: number
          vida_util_anos?: number | null
        }
        Update: {
          categoria?: Database["public"]["Enums"]["categoria_patrimonio"]
          codigo_bem?: string
          created_at?: string | null
          data_aquisicao?: string
          descricao?: string | null
          documentos_url?: string[] | null
          estado_conservacao?: Database["public"]["Enums"]["estado_conservacao"]
          fornecedor?: string | null
          id?: string
          localizacao?: string | null
          nome?: string
          nota_fiscal?: string | null
          numero_serie?: string | null
          observacoes?: string | null
          responsavel?: string | null
          setor?: string | null
          setor_id?: string | null
          status?: Database["public"]["Enums"]["status_patrimonio"]
          updated_at?: string | null
          valor_aquisicao?: number
          vida_util_anos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patrimonio_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes: {
        Row: {
          acao: string
          ativo: boolean
          created_at: string | null
          id: string
          modulo: string
          perfil: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          acao: string
          ativo?: boolean
          created_at?: string | null
          id?: string
          modulo: string
          perfil: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          acao?: string
          ativo?: boolean
          created_at?: string | null
          id?: string
          modulo?: string
          perfil?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      permissoes_log: {
        Row: {
          acao: string
          campo_modificado: string
          created_at: string | null
          id: string
          modulo: string
          perfil: Database["public"]["Enums"]["app_role"]
          user_id: string | null
          valor_anterior: string | null
          valor_novo: string | null
        }
        Insert: {
          acao: string
          campo_modificado: string
          created_at?: string | null
          id?: string
          modulo: string
          perfil: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Update: {
          acao?: string
          campo_modificado?: string
          created_at?: string | null
          id?: string
          modulo?: string
          perfil?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
          valor_anterior?: string | null
          valor_novo?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          nome_completo: string
          setor_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          telefone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          nome_completo: string
          setor_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          telefone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          nome_completo?: string
          setor_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          telefone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta: {
        Row: {
          atualizado_em: string
          contrato_id: string | null
          criado_em: string
          criado_por: string | null
          criado_por_nome: string | null
          descricao: string | null
          id: string
          id_proposta: string | null
          lead_id: string | null
          licitacao_id: string | null
          mensagem_email: string | null
          mensagem_instagram: string | null
          mensagem_linkedin: string | null
          mensagem_tiktok: string | null
          mensagem_whatsapp: string | null
          nome: string | null
          numero_proposta: number | null
          observacoes: string | null
          servico_id: string | null
          status: string
          status_email: string | null
          tipo: string | null
          tipo_disparo: Database["public"]["Enums"]["tipo_disparo_enum"]
          ultimo_envio_email: string | null
          unidade_id: string | null
          updated_at: string | null
          valor: number | null
        }
        Insert: {
          atualizado_em?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          id?: string
          id_proposta?: string | null
          lead_id?: string | null
          licitacao_id?: string | null
          mensagem_email?: string | null
          mensagem_instagram?: string | null
          mensagem_linkedin?: string | null
          mensagem_tiktok?: string | null
          mensagem_whatsapp?: string | null
          nome?: string | null
          numero_proposta?: number | null
          observacoes?: string | null
          servico_id?: string | null
          status?: string
          status_email?: string | null
          tipo?: string | null
          tipo_disparo?: Database["public"]["Enums"]["tipo_disparo_enum"]
          ultimo_envio_email?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Update: {
          atualizado_em?: string
          contrato_id?: string | null
          criado_em?: string
          criado_por?: string | null
          criado_por_nome?: string | null
          descricao?: string | null
          id?: string
          id_proposta?: string | null
          lead_id?: string | null
          licitacao_id?: string | null
          mensagem_email?: string | null
          mensagem_instagram?: string | null
          mensagem_linkedin?: string | null
          mensagem_tiktok?: string | null
          mensagem_whatsapp?: string | null
          nome?: string | null
          numero_proposta?: number | null
          observacoes?: string | null
          servico_id?: string | null
          status?: string
          status_email?: string | null
          tipo?: string | null
          tipo_disparo?: Database["public"]["Enums"]["tipo_disparo_enum"]
          ultimo_envio_email?: string | null
          unidade_id?: string | null
          updated_at?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposta_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "proposta_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      proposta_itens: {
        Row: {
          contrato_item_id: string | null
          created_at: string | null
          id: string
          item_nome: string
          proposta_id: string
          quantidade: number | null
          updated_at: string | null
          valor_contrato: number | null
          valor_medico: number
        }
        Insert: {
          contrato_item_id?: string | null
          created_at?: string | null
          id?: string
          item_nome: string
          proposta_id: string
          quantidade?: number | null
          updated_at?: string | null
          valor_contrato?: number | null
          valor_medico?: number
        }
        Update: {
          contrato_item_id?: string | null
          created_at?: string | null
          id?: string
          item_nome?: string
          proposta_id?: string
          quantidade?: number | null
          updated_at?: string | null
          valor_contrato?: number | null
          valor_medico?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposta_itens_contrato_item_id_fkey"
            columns: ["contrato_item_id"]
            isOneToOne: false
            referencedRelation: "contrato_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposta_itens_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
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
      radiologia_agendas: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_agenda: string
          data_fim: string | null
          data_inicio: string | null
          exame_servico: string | null
          id: string
          medico_id: string
          observacoes: string | null
          total_horas_dia: number | null
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_agenda: string
          data_fim?: string | null
          data_inicio?: string | null
          exame_servico?: string | null
          id?: string
          medico_id: string
          observacoes?: string | null
          total_horas_dia?: number | null
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_agenda?: string
          data_fim?: string | null
          data_inicio?: string | null
          exame_servico?: string | null
          id?: string
          medico_id?: string
          observacoes?: string | null
          total_horas_dia?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_agendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_agendas_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_agendas_escalas: {
        Row: {
          agenda_id: string
          concluido: boolean | null
          created_at: string | null
          data: string
          id: string
          observacoes: string | null
          status: string
          total_horas: number
          turnos: Json | null
          updated_at: string | null
        }
        Insert: {
          agenda_id: string
          concluido?: boolean | null
          created_at?: string | null
          data: string
          id?: string
          observacoes?: string | null
          status?: string
          total_horas: number
          turnos?: Json | null
          updated_at?: string | null
        }
        Update: {
          agenda_id?: string
          concluido?: boolean | null
          created_at?: string | null
          data?: string
          id?: string
          observacoes?: string | null
          status?: string
          total_horas?: number
          turnos?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_agendas_escalas_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "radiologia_agendas"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_ajuste_laudos: {
        Row: {
          anexos: string[] | null
          cliente_id: string
          cod_acesso: string | null
          created_at: string | null
          data_emissao: string
          descricao_ajuste: string
          id: string
          identificador_laudo: string
          medico_responsavel_id: string
          motivo_ajuste: Database["public"]["Enums"]["motivo_ajuste_laudo"]
          nome_paciente: string | null
          pendencia_id: string | null
          prazo_ajuste: string | null
          responsavel_ajuste_id: string | null
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          status: Database["public"]["Enums"]["status_ajuste_laudo"]
          updated_at: string | null
        }
        Insert: {
          anexos?: string[] | null
          cliente_id: string
          cod_acesso?: string | null
          created_at?: string | null
          data_emissao: string
          descricao_ajuste: string
          id?: string
          identificador_laudo: string
          medico_responsavel_id: string
          motivo_ajuste: Database["public"]["Enums"]["motivo_ajuste_laudo"]
          nome_paciente?: string | null
          pendencia_id?: string | null
          prazo_ajuste?: string | null
          responsavel_ajuste_id?: string | null
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          status?: Database["public"]["Enums"]["status_ajuste_laudo"]
          updated_at?: string | null
        }
        Update: {
          anexos?: string[] | null
          cliente_id?: string
          cod_acesso?: string | null
          created_at?: string | null
          data_emissao?: string
          descricao_ajuste?: string
          id?: string
          identificador_laudo?: string
          medico_responsavel_id?: string
          motivo_ajuste?: Database["public"]["Enums"]["motivo_ajuste_laudo"]
          nome_paciente?: string | null
          pendencia_id?: string | null
          prazo_ajuste?: string | null
          responsavel_ajuste_id?: string | null
          segmento?: Database["public"]["Enums"]["segmento_radiologia"]
          status?: Database["public"]["Enums"]["status_ajuste_laudo"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_ajuste_laudos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_ajuste_laudos_medico_responsavel_id_fkey"
            columns: ["medico_responsavel_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_ajuste_laudos_pendencia_id_fkey"
            columns: ["pendencia_id"]
            isOneToOne: false
            referencedRelation: "radiologia_pendencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_ajuste_laudos_responsavel_ajuste_id_fkey"
            columns: ["responsavel_ajuste_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_config_sla_cliente: {
        Row: {
          cliente_id: string
          created_at: string | null
          id: string
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          sla_horas: number
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          id?: string
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          sla_horas?: number
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          id?: string
          segmento?: Database["public"]["Enums"]["segmento_radiologia"]
          sla_horas?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_config_sla_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_ecg: {
        Row: {
          anexos: string[] | null
          cliente_id: string
          created_at: string | null
          data_hora_liberacao: string
          id: string
          medico_id: string
          paciente: string
          updated_at: string | null
        }
        Insert: {
          anexos?: string[] | null
          cliente_id: string
          created_at?: string | null
          data_hora_liberacao: string
          id?: string
          medico_id: string
          paciente: string
          updated_at?: string | null
        }
        Update: {
          anexos?: string[] | null
          cliente_id?: string
          created_at?: string | null
          data_hora_liberacao?: string
          id?: string
          medico_id?: string
          paciente?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_ecg_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_ecg_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_exames_atraso: {
        Row: {
          anexos: string[] | null
          cliente_id: string
          created_at: string | null
          data_hora_execucao: string
          exame: string
          id: string
          medico_id: string
          observacao: string | null
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at: string | null
        }
        Insert: {
          anexos?: string[] | null
          cliente_id: string
          created_at?: string | null
          data_hora_execucao: string
          exame: string
          id?: string
          medico_id: string
          observacao?: string | null
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at?: string | null
        }
        Update: {
          anexos?: string[] | null
          cliente_id?: string
          created_at?: string | null
          data_hora_execucao?: string
          exame?: string
          id?: string
          medico_id?: string
          observacao?: string | null
          segmento?: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_exames_atraso_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_exames_atraso_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_importacoes: {
        Row: {
          arquivo_nome: string
          created_at: string | null
          erros: Json | null
          id: string
          importado_por: string | null
          linhas_atualizadas: number
          linhas_erro: number
          linhas_inseridas: number
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          created_at?: string | null
          erros?: Json | null
          id?: string
          importado_por?: string | null
          linhas_atualizadas: number
          linhas_erro: number
          linhas_inseridas: number
          total_linhas: number
        }
        Update: {
          arquivo_nome?: string
          created_at?: string | null
          erros?: Json | null
          id?: string
          importado_por?: string | null
          linhas_atualizadas?: number
          linhas_erro?: number
          linhas_inseridas?: number
          total_linhas?: number
        }
        Relationships: []
      }
      radiologia_imports_historico: {
        Row: {
          arquivo_id: string
          arquivo_nome: string
          cliente_id: string
          created_at: string | null
          id: string
          registros_atualizados: number | null
          registros_novos: number | null
          total_registros: number | null
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          arquivo_id: string
          arquivo_nome: string
          cliente_id: string
          created_at?: string | null
          id?: string
          registros_atualizados?: number | null
          registros_novos?: number | null
          total_registros?: number | null
          usuario_id?: string | null
          usuario_nome: string
        }
        Update: {
          arquivo_id?: string
          arquivo_nome?: string
          cliente_id?: string
          created_at?: string | null
          id?: string
          registros_atualizados?: number | null
          registros_novos?: number | null
          total_registros?: number | null
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_imports_historico_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_pendencias: {
        Row: {
          acesso: string | null
          ae_origem: string | null
          anexos: string[] | null
          arquivo_importacao: string | null
          atribuido_a: string | null
          cliente_id: string | null
          cod_acesso: string | null
          created_at: string | null
          data_deteccao: string | null
          data_exame: string | null
          data_final: string | null
          data_importacao: string | null
          data_nascimento: string | null
          data_referencia: string | null
          data_resolucao: string | null
          descricao_exame: string | null
          descricao_inicial: string | null
          descricao_resolucao: string | null
          exame: string | null
          hora_exame: string | null
          id: string
          id_exame_externo: string | null
          id_paciente: string | null
          ignorada: boolean | null
          importado_por: string | null
          layout_versao: string | null
          medico_atribuido_id: string | null
          medico_atribuido_nome: string | null
          medico_finalizador_id: string | null
          medico_id: string | null
          medico_prescritor: string | null
          modalidade: string | null
          motivo_ignorar: string | null
          nivel_urgencia:
            | Database["public"]["Enums"]["nivel_urgencia_radiologia"]
            | null
          nome_paciente: string | null
          nota: string | null
          numero_imagens: number | null
          observacoes: string | null
          observacoes_internas: string | null
          prazo_limite_sla: string | null
          prioridade: string | null
          quantidade_pendente: number | null
          responsavel_atual_id: string | null
          segmento: Database["public"]["Enums"]["segmento_radiologia"] | null
          sla: string | null
          sla_horas: number | null
          status_pendencia: string | null
          tempo_decorrido: string | null
          tipo_atendimento: string | null
          tipo_registro: string | null
          updated_at: string | null
        }
        Insert: {
          acesso?: string | null
          ae_origem?: string | null
          anexos?: string[] | null
          arquivo_importacao?: string | null
          atribuido_a?: string | null
          cliente_id?: string | null
          cod_acesso?: string | null
          created_at?: string | null
          data_deteccao?: string | null
          data_exame?: string | null
          data_final?: string | null
          data_importacao?: string | null
          data_nascimento?: string | null
          data_referencia?: string | null
          data_resolucao?: string | null
          descricao_exame?: string | null
          descricao_inicial?: string | null
          descricao_resolucao?: string | null
          exame?: string | null
          hora_exame?: string | null
          id?: string
          id_exame_externo?: string | null
          id_paciente?: string | null
          ignorada?: boolean | null
          importado_por?: string | null
          layout_versao?: string | null
          medico_atribuido_id?: string | null
          medico_atribuido_nome?: string | null
          medico_finalizador_id?: string | null
          medico_id?: string | null
          medico_prescritor?: string | null
          modalidade?: string | null
          motivo_ignorar?: string | null
          nivel_urgencia?:
            | Database["public"]["Enums"]["nivel_urgencia_radiologia"]
            | null
          nome_paciente?: string | null
          nota?: string | null
          numero_imagens?: number | null
          observacoes?: string | null
          observacoes_internas?: string | null
          prazo_limite_sla?: string | null
          prioridade?: string | null
          quantidade_pendente?: number | null
          responsavel_atual_id?: string | null
          segmento?: Database["public"]["Enums"]["segmento_radiologia"] | null
          sla?: string | null
          sla_horas?: number | null
          status_pendencia?: string | null
          tempo_decorrido?: string | null
          tipo_atendimento?: string | null
          tipo_registro?: string | null
          updated_at?: string | null
        }
        Update: {
          acesso?: string | null
          ae_origem?: string | null
          anexos?: string[] | null
          arquivo_importacao?: string | null
          atribuido_a?: string | null
          cliente_id?: string | null
          cod_acesso?: string | null
          created_at?: string | null
          data_deteccao?: string | null
          data_exame?: string | null
          data_final?: string | null
          data_importacao?: string | null
          data_nascimento?: string | null
          data_referencia?: string | null
          data_resolucao?: string | null
          descricao_exame?: string | null
          descricao_inicial?: string | null
          descricao_resolucao?: string | null
          exame?: string | null
          hora_exame?: string | null
          id?: string
          id_exame_externo?: string | null
          id_paciente?: string | null
          ignorada?: boolean | null
          importado_por?: string | null
          layout_versao?: string | null
          medico_atribuido_id?: string | null
          medico_atribuido_nome?: string | null
          medico_finalizador_id?: string | null
          medico_id?: string | null
          medico_prescritor?: string | null
          modalidade?: string | null
          motivo_ignorar?: string | null
          nivel_urgencia?:
            | Database["public"]["Enums"]["nivel_urgencia_radiologia"]
            | null
          nome_paciente?: string | null
          nota?: string | null
          numero_imagens?: number | null
          observacoes?: string | null
          observacoes_internas?: string | null
          prazo_limite_sla?: string | null
          prioridade?: string | null
          quantidade_pendente?: number | null
          responsavel_atual_id?: string | null
          segmento?: Database["public"]["Enums"]["segmento_radiologia"] | null
          sla?: string | null
          sla_horas?: number | null
          status_pendencia?: string | null
          tempo_decorrido?: string | null
          tipo_atendimento?: string | null
          tipo_registro?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_pendencias_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_pendencias_medico_atribuido_id_fkey"
            columns: ["medico_atribuido_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_pendencias_medico_finalizador_id_fkey"
            columns: ["medico_finalizador_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_pendencias_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_pendencias_comentarios: {
        Row: {
          anexos: string[] | null
          comentario: string
          created_at: string | null
          id: string
          pendencia_id: string
          updated_at: string | null
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          anexos?: string[] | null
          comentario: string
          created_at?: string | null
          id?: string
          pendencia_id: string
          updated_at?: string | null
          usuario_id?: string | null
          usuario_nome: string
        }
        Update: {
          anexos?: string[] | null
          comentario?: string
          created_at?: string | null
          id?: string
          pendencia_id?: string
          updated_at?: string | null
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_pendencias_comentarios_pendencia_id_fkey"
            columns: ["pendencia_id"]
            isOneToOne: false
            referencedRelation: "radiologia_pendencias"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_pendencias_historico: {
        Row: {
          acao: string
          anexos: string[] | null
          created_at: string | null
          data_hora: string | null
          detalhes: string | null
          id: string
          pendencia_id: string
          usuario_id: string | null
          usuario_nome: string
        }
        Insert: {
          acao: string
          anexos?: string[] | null
          created_at?: string | null
          data_hora?: string | null
          detalhes?: string | null
          id?: string
          pendencia_id: string
          usuario_id?: string | null
          usuario_nome: string
        }
        Update: {
          acao?: string
          anexos?: string[] | null
          created_at?: string | null
          data_hora?: string | null
          detalhes?: string | null
          id?: string
          pendencia_id?: string
          usuario_id?: string | null
          usuario_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_pendencias_historico_pendencia_id_fkey"
            columns: ["pendencia_id"]
            isOneToOne: false
            referencedRelation: "radiologia_pendencias"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_pendencias_snapshots: {
        Row: {
          created_at: string | null
          dados_anteriores: Json
          id: string
          import_id: string
          pendencia_id: string
          tipo_operacao: string
        }
        Insert: {
          created_at?: string | null
          dados_anteriores: Json
          id?: string
          import_id: string
          pendencia_id: string
          tipo_operacao: string
        }
        Update: {
          created_at?: string | null
          dados_anteriores?: Json
          id?: string
          import_id?: string
          pendencia_id?: string
          tipo_operacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_pendencias_snapshots_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "radiologia_imports_historico"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_producao_comparacao: {
        Row: {
          arquivo_gss_url: string | null
          arquivo_hospital_url: string | null
          cliente_id: string
          created_at: string | null
          diferenca: number | null
          exames_gss: number
          exames_hospital: number
          id: string
          observacoes: string | null
          periodo_fim: string
          periodo_inicio: string
          status: string
          updated_at: string | null
        }
        Insert: {
          arquivo_gss_url?: string | null
          arquivo_hospital_url?: string | null
          cliente_id: string
          created_at?: string | null
          diferenca?: number | null
          exames_gss?: number
          exames_hospital?: number
          id?: string
          observacoes?: string | null
          periodo_fim: string
          periodo_inicio: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          arquivo_gss_url?: string | null
          arquivo_hospital_url?: string | null
          cliente_id?: string
          created_at?: string | null
          diferenca?: number | null
          exames_gss?: number
          exames_hospital?: number
          id?: string
          observacoes?: string | null
          periodo_fim?: string
          periodo_inicio?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_producao_comparacao_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      radiologia_producao_exames: {
        Row: {
          cliente_id: string
          created_at: string | null
          data: string
          id: string
          medico_id: string
          observacoes: string | null
          quantidade: number
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data: string
          id?: string
          medico_id: string
          observacoes?: string | null
          quantidade: number
          segmento: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data?: string
          id?: string
          medico_id?: string
          observacoes?: string | null
          quantidade?: number
          segmento?: Database["public"]["Enums"]["segmento_radiologia"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "radiologia_producao_exames_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "radiologia_producao_exames_medico_id_fkey"
            columns: ["medico_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      raia_sla_config: {
        Row: {
          acao_estouro: string
          canal: string
          created_at: string
          prazo_horas: number
          updated_at: string
        }
        Insert: {
          acao_estouro?: string
          canal: string
          created_at?: string
          prazo_horas: number
          updated_at?: string
        }
        Update: {
          acao_estouro?: string
          canal?: string
          created_at?: string
          prazo_horas?: number
          updated_at?: string
        }
        Relationships: []
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
          gravidade: string | null
          id: string
          medico_vinculado_id: string | null
          status: string
          tipo: string
          tipo_principal: string
          updated_at: string | null
        }
        Insert: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          descricao: string
          gravidade?: string | null
          id?: string
          medico_vinculado_id?: string | null
          status?: string
          tipo: string
          tipo_principal?: string
          updated_at?: string | null
        }
        Update: {
          cliente_vinculado_id?: string | null
          created_at?: string | null
          descricao?: string
          gravidade?: string | null
          id?: string
          medico_vinculado_id?: string | null
          status?: string
          tipo?: string
          tipo_principal?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relacionamento_medico_cliente_vinculado_id_fkey"
            columns: ["cliente_vinculado_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relacionamento_medico_medico_vinculado_id_fkey"
            columns: ["medico_vinculado_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
        ]
      }
      segmentos_publico: {
        Row: {
          created_at: string | null
          criado_por: string | null
          descricao: string | null
          filtros: Json
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          criado_por?: string | null
          descricao?: string | null
          filtros?: Json
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      servico: {
        Row: {
          ativo: boolean
          atualizado_em: string
          contrato_capitacao_id: string
          criado_em: string
          descricao: string | null
          especialidade: string | null
          id: string
          lista_servicos: string[] | null
          nome: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          contrato_capitacao_id: string
          criado_em?: string
          descricao?: string | null
          especialidade?: string | null
          id?: string
          lista_servicos?: string[] | null
          nome: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          contrato_capitacao_id?: string
          criado_em?: string
          descricao?: string | null
          especialidade?: string | null
          id?: string
          lista_servicos?: string[] | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "servico_contrato_capitacao_id_fkey"
            columns: ["contrato_capitacao_id"]
            isOneToOne: false
            referencedRelation: "contrato_capitacao"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          centro_custo_id: string
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          centro_custo_id: string
          created_at?: string | null
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          centro_custo_id?: string
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setores_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "centros_custo"
            referencedColumns: ["id"]
          },
        ]
      }
      sigma_email_log: {
        Row: {
          assunto: string
          created_at: string
          destinatario_email: string
          destinatario_nome: string | null
          enviado_por_id: string | null
          enviado_por_nome: string | null
          erro: string | null
          id: string
          metadata: Json | null
          modulo: string
          referencia_id: string | null
          status: string
        }
        Insert: {
          assunto: string
          created_at?: string
          destinatario_email: string
          destinatario_nome?: string | null
          enviado_por_id?: string | null
          enviado_por_nome?: string | null
          erro?: string | null
          id?: string
          metadata?: Json | null
          modulo: string
          referencia_id?: string | null
          status?: string
        }
        Update: {
          assunto?: string
          created_at?: string
          destinatario_email?: string
          destinatario_nome?: string | null
          enviado_por_id?: string | null
          enviado_por_nome?: string | null
          erro?: string | null
          id?: string
          metadata?: Json | null
          modulo?: string
          referencia_id?: string | null
          status?: string
        }
        Relationships: []
      }
      sigzap_contacts: {
        Row: {
          contact_jid: string
          contact_name: string | null
          contact_phone: string
          created_at: string | null
          id: string
          instance_id: string | null
          profile_picture_url: string | null
          updated_at: string | null
        }
        Insert: {
          contact_jid: string
          contact_name?: string | null
          contact_phone: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_jid?: string
          contact_name?: string | null
          contact_phone?: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          profile_picture_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sigzap_contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "sigzap_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      sigzap_conversations: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          contact_id: string
          created_at: string | null
          id: string
          instance_id: string
          last_message_at: string | null
          last_message_text: string | null
          lead_id: string | null
          not_the_doctor: boolean
          not_the_doctor_at: string | null
          not_the_doctor_by: string | null
          status: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          contact_id: string
          created_at?: string | null
          id?: string
          instance_id: string
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          not_the_doctor?: boolean
          not_the_doctor_at?: string | null
          not_the_doctor_by?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          contact_id?: string
          created_at?: string | null
          id?: string
          instance_id?: string
          last_message_at?: string | null
          last_message_text?: string | null
          lead_id?: string | null
          not_the_doctor?: boolean
          not_the_doctor_at?: string | null
          not_the_doctor_by?: string | null
          status?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sigzap_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_conversations_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "vw_produtividade_disparos"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sigzap_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "sigzap_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "sigzap_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      sigzap_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          instance_id: string | null
          raw_payload: Json | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          instance_id?: string | null
          raw_payload?: Json | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          instance_id?: string | null
          raw_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sigzap_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "sigzap_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      sigzap_instances: {
        Row: {
          chip_id: string | null
          created_at: string | null
          id: string
          instance_uuid: string | null
          is_trafego_pago: boolean
          name: string
          phone_number: string | null
          profile_name: string | null
          profile_picture_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          chip_id?: string | null
          created_at?: string | null
          id?: string
          instance_uuid?: string | null
          is_trafego_pago?: boolean
          name: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          chip_id?: string | null
          created_at?: string | null
          id?: string
          instance_uuid?: string | null
          is_trafego_pago?: boolean
          name?: string
          phone_number?: string | null
          profile_name?: string | null
          profile_picture_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sigzap_instances_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "chips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sigzap_instances_chip_id_fkey"
            columns: ["chip_id"]
            isOneToOne: false
            referencedRelation: "vw_chip_performance_7d"
            referencedColumns: ["chip_id"]
          },
        ]
      }
      sigzap_messages: {
        Row: {
          conversation_id: string
          created_at: string | null
          from_me: boolean | null
          id: string
          media_caption: string | null
          media_filename: string | null
          media_mime_type: string | null
          media_storage_path: string | null
          media_url: string | null
          message_status: string | null
          message_text: string | null
          message_type: string | null
          quoted_message_id: string | null
          quoted_message_text: string | null
          raw_payload: Json | null
          reaction: string | null
          sender_jid: string | null
          sent_at: string | null
          sent_by_user_id: string | null
          sent_via_instance_name: string | null
          wa_message_id: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          media_caption?: string | null
          media_filename?: string | null
          media_mime_type?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_status?: string | null
          message_text?: string | null
          message_type?: string | null
          quoted_message_id?: string | null
          quoted_message_text?: string | null
          raw_payload?: Json | null
          reaction?: string | null
          sender_jid?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          sent_via_instance_name?: string | null
          wa_message_id?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          from_me?: boolean | null
          id?: string
          media_caption?: string | null
          media_filename?: string | null
          media_mime_type?: string | null
          media_storage_path?: string | null
          media_url?: string | null
          message_status?: string | null
          message_text?: string | null
          message_type?: string | null
          quoted_message_id?: string | null
          quoted_message_text?: string | null
          raw_payload?: Json | null
          reaction?: string | null
          sender_jid?: string | null
          sent_at?: string | null
          sent_by_user_id?: string | null
          sent_via_instance_name?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sigzap_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "sigzap_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      supabase_config: {
        Row: {
          chave: string
          created_at: string
          id: string
          updated_at: string
          valor: string | null
        }
        Insert: {
          chave: string
          created_at?: string
          id?: string
          updated_at?: string
          valor?: string | null
        }
        Update: {
          chave?: string
          created_at?: string
          id?: string
          updated_at?: string
          valor?: string | null
        }
        Relationships: []
      }
      suporte_comentarios: {
        Row: {
          anexos: string[] | null
          autor_email: string | null
          autor_id: string | null
          autor_nome: string
          created_at: string | null
          id: string
          is_externo: boolean | null
          mensagem: string | null
          ticket_id: string
        }
        Insert: {
          anexos?: string[] | null
          autor_email?: string | null
          autor_id?: string | null
          autor_nome: string
          created_at?: string | null
          id?: string
          is_externo?: boolean | null
          mensagem?: string | null
          ticket_id: string
        }
        Update: {
          anexos?: string[] | null
          autor_email?: string | null
          autor_id?: string | null
          autor_nome?: string
          created_at?: string | null
          id?: string
          is_externo?: boolean | null
          mensagem?: string | null
          ticket_id?: string
        }
        Relationships: []
      }
      suporte_sla_config: {
        Row: {
          created_at: string | null
          id: string
          nivel_urgencia: Database["public"]["Enums"]["nivel_urgencia_suporte"]
          sla_resolucao_minutos: number
          sla_resposta_minutos: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nivel_urgencia: Database["public"]["Enums"]["nivel_urgencia_suporte"]
          sla_resolucao_minutos: number
          sla_resposta_minutos: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nivel_urgencia?: Database["public"]["Enums"]["nivel_urgencia_suporte"]
          sla_resolucao_minutos?: number
          sla_resposta_minutos?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      suporte_tickets: {
        Row: {
          anexos: string[] | null
          created_at: string | null
          data_abertura: string
          data_conclusao: string | null
          data_primeira_resposta: string | null
          data_ultima_atualizacao: string
          descricao: string
          destino: Database["public"]["Enums"]["destino_suporte"]
          email_enviado_em: string | null
          email_erro: string | null
          email_status: string | null
          fornecedor_externo:
            | Database["public"]["Enums"]["fornecedor_externo"]
            | null
          historico: Json | null
          id: string
          nivel_urgencia:
            | Database["public"]["Enums"]["nivel_urgencia_suporte"]
            | null
          numero: string
          resolvido_por_id: string | null
          resolvido_por_nome: string | null
          responsavel_ti_id: string | null
          responsavel_ti_nome: string | null
          setor_id: string | null
          setor_nome: string | null
          setor_responsavel: string | null
          sla_resolucao_minutos: number | null
          sla_resposta_minutos: number | null
          solicitante_id: string
          solicitante_nome: string
          status: Database["public"]["Enums"]["status_ticket"]
          tipo: Database["public"]["Enums"]["tipo_suporte"]
          tipo_impacto:
            | Database["public"]["Enums"]["tipo_impacto_suporte"]
            | null
          ultima_visualizacao_admin: string | null
          updated_at: string | null
        }
        Insert: {
          anexos?: string[] | null
          created_at?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          data_primeira_resposta?: string | null
          data_ultima_atualizacao?: string
          descricao: string
          destino: Database["public"]["Enums"]["destino_suporte"]
          email_enviado_em?: string | null
          email_erro?: string | null
          email_status?: string | null
          fornecedor_externo?:
            | Database["public"]["Enums"]["fornecedor_externo"]
            | null
          historico?: Json | null
          id?: string
          nivel_urgencia?:
            | Database["public"]["Enums"]["nivel_urgencia_suporte"]
            | null
          numero: string
          resolvido_por_id?: string | null
          resolvido_por_nome?: string | null
          responsavel_ti_id?: string | null
          responsavel_ti_nome?: string | null
          setor_id?: string | null
          setor_nome?: string | null
          setor_responsavel?: string | null
          sla_resolucao_minutos?: number | null
          sla_resposta_minutos?: number | null
          solicitante_id: string
          solicitante_nome: string
          status?: Database["public"]["Enums"]["status_ticket"]
          tipo: Database["public"]["Enums"]["tipo_suporte"]
          tipo_impacto?:
            | Database["public"]["Enums"]["tipo_impacto_suporte"]
            | null
          ultima_visualizacao_admin?: string | null
          updated_at?: string | null
        }
        Update: {
          anexos?: string[] | null
          created_at?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          data_primeira_resposta?: string | null
          data_ultima_atualizacao?: string
          descricao?: string
          destino?: Database["public"]["Enums"]["destino_suporte"]
          email_enviado_em?: string | null
          email_erro?: string | null
          email_status?: string | null
          fornecedor_externo?:
            | Database["public"]["Enums"]["fornecedor_externo"]
            | null
          historico?: Json | null
          id?: string
          nivel_urgencia?:
            | Database["public"]["Enums"]["nivel_urgencia_suporte"]
            | null
          numero?: string
          resolvido_por_id?: string | null
          resolvido_por_nome?: string | null
          responsavel_ti_id?: string | null
          responsavel_ti_nome?: string | null
          setor_id?: string | null
          setor_nome?: string | null
          setor_responsavel?: string | null
          sla_resolucao_minutos?: number | null
          sla_resposta_minutos?: number | null
          solicitante_id?: string
          solicitante_nome?: string
          status?: Database["public"]["Enums"]["status_ticket"]
          tipo?: Database["public"]["Enums"]["tipo_suporte"]
          tipo_impacto?:
            | Database["public"]["Enums"]["tipo_impacto_suporte"]
            | null
          ultima_visualizacao_admin?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_notifications: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string
          referencia_id: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem: string
          referencia_id?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string
          referencia_id?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      tarefas_captacao: {
        Row: {
          campanha_proposta_id: string | null
          canal: string | null
          concluida_em: string | null
          concluida_por: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          lead_id: string | null
          prazo: string | null
          prioridade: string
          responsavel_id: string | null
          responsavel_nome: string | null
          status: string
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          campanha_proposta_id?: string | null
          canal?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          campanha_proposta_id?: string | null
          canal?: string | null
          concluida_em?: string | null
          concluida_por?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          lead_id?: string | null
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          responsavel_nome?: string | null
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_captacao_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_captacao_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "tarefas_captacao_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_captacao_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefas_captacao_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      trafego_pago_conversoes: {
        Row: {
          campanha_id: string | null
          campanha_proposta_id: string | null
          conversation_id: string | null
          created_at: string
          detalhes: Json | null
          evento: string
          id: string
          instancia: string | null
          lead_id: string
          ocorreu_em: string
          proposta_id: string | null
        }
        Insert: {
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detalhes?: Json | null
          evento: string
          id?: string
          instancia?: string | null
          lead_id: string
          ocorreu_em?: string
          proposta_id?: string | null
        }
        Update: {
          campanha_id?: string | null
          campanha_proposta_id?: string | null
          conversation_id?: string | null
          created_at?: string
          detalhes?: Json | null
          evento?: string
          id?: string
          instancia?: string | null
          lead_id?: string
          ocorreu_em?: string
          proposta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trafego_pago_conversoes_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_conversoes_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "trafego_pago_conversoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_conversoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_conversoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      trafego_pago_envios: {
        Row: {
          arquivo_nome: string | null
          campanha_id: string | null
          campanha_proposta_id: string
          enviado_em: string
          enviado_por: string | null
          id: string
          instancia: string | null
          lead_id: string
          metadados: Json | null
          proposta_id: string | null
          telefone_enviado: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          campanha_id?: string | null
          campanha_proposta_id: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          instancia?: string | null
          lead_id: string
          metadados?: Json | null
          proposta_id?: string | null
          telefone_enviado?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          campanha_id?: string | null
          campanha_proposta_id?: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          instancia?: string | null
          lead_id?: string
          metadados?: Json | null
          proposta_id?: string | null
          telefone_enviado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trafego_pago_envios_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_envios_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
          {
            foreignKeyName: "trafego_pago_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_duplicados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trafego_pago_envios_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "vw_leads_quentes_esperando"
            referencedColumns: ["lead_id"]
          },
        ]
      }
      unidades: {
        Row: {
          cliente_id: string
          codigo: string | null
          created_at: string | null
          id: string
          nome: string
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome: string
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          codigo?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notas: {
        Row: {
          arquivada: boolean | null
          conteudo: string | null
          created_at: string
          fixada: boolean | null
          id: string
          pasta_id: string | null
          tags: string[] | null
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arquivada?: boolean | null
          conteudo?: string | null
          created_at?: string
          fixada?: boolean | null
          id?: string
          pasta_id?: string | null
          tags?: string[] | null
          titulo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arquivada?: boolean | null
          conteudo?: string | null
          created_at?: string
          fixada?: boolean | null
          id?: string
          pasta_id?: string | null
          tags?: string[] | null
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notas_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "user_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notas_anexos: {
        Row: {
          created_at: string
          id: string
          nome: string
          nota_id: string
          tipo: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          nota_id: string
          tipo?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          nota_id?: string
          tipo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notas_anexos_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "user_notas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notas_checklist: {
        Row: {
          concluido: boolean | null
          created_at: string
          id: string
          nota_id: string
          ordem: number | null
          texto: string
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string
          id?: string
          nota_id: string
          ordem?: number | null
          texto: string
        }
        Update: {
          concluido?: boolean | null
          created_at?: string
          id?: string
          nota_id?: string
          ordem?: number | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notas_checklist_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "user_notas"
            referencedColumns: ["id"]
          },
        ]
      }
      user_pastas: {
        Row: {
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          ordem: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string
          user_id?: string
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
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "vw_produtividade_disparos"
            referencedColumns: ["user_id"]
          },
        ]
      }
      whatsapp_rate_limit: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "worklist_tarefas_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worklist_tarefas_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worklist_tarefas_relacionamento_id_fkey"
            columns: ["relacionamento_id"]
            isOneToOne: false
            referencedRelation: "relacionamento_medico"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_campanha_metricas: {
        Row: {
          campanha_criada_em: string | null
          campanha_id: string | null
          campanha_nome: string | null
          campanha_status: Database["public"]["Enums"]["status_campanha"] | null
          contatados: number | null
          convertidos: number | null
          descartados: number | null
          disparados: number | null
          em_conversa: number | null
          frios: number | null
          horas_ate_quente: number | null
          quentes: number | null
          quentes_esperando_1h: number | null
          sem_resposta: number | null
          taxa_conversao_pct: number | null
          taxa_qualificacao_pct: number | null
          total_leads: number | null
        }
        Relationships: []
      }
      vw_chip_performance_7d: {
        Row: {
          chip_id: string | null
          chip_nome: string | null
          chip_numero: string | null
          connection_state: string | null
          disparos_7d: number | null
          erros_7d: number | null
          instance_name: string | null
          pode_disparar: boolean | null
          ultimo_disparo: string | null
        }
        Relationships: []
      }
      vw_lead_status_por_proposta: {
        Row: {
          bloqueado_blacklist: boolean | null
          bloqueado_janela_7d: boolean | null
          bloqueado_temp: boolean | null
          campanha_proposta_id: string | null
          lead_id: string | null
          status_proposta: string | null
          tem_raia_aberta: boolean | null
          ultima_decisao_em: string | null
          ultimo_disparo: string | null
          ultimo_motivo: string | null
        }
        Relationships: []
      }
      vw_lead_tempo_por_canal: {
        Row: {
          campanha_proposta_id: string | null
          canal: string | null
          lead_id: string | null
          passagens: number | null
          tem_aberto: boolean | null
          tempo_total_segundos: number | null
          ultima_entrada: string | null
          ultima_saida: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_proposta_lead_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "campanha_propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_proposta_lead_canais_campanha_proposta_id_fkey"
            columns: ["campanha_proposta_id"]
            isOneToOne: false
            referencedRelation: "vw_trafego_pago_funil"
            referencedColumns: ["campanha_proposta_id"]
          },
        ]
      }
      vw_lead_timeline: {
        Row: {
          canal: string | null
          conteudo: string | null
          lead_id: string | null
          metadados: Json | null
          operador: string | null
          origem: string | null
          tipo: string | null
          ts: string | null
        }
        Relationships: []
      }
      vw_leads_duplicados: {
        Row: {
          chaves_match: string[] | null
          cidade: string | null
          cpf: string | null
          created_at: string | null
          crm: string | null
          email: string | null
          especialidade: string | null
          id: string | null
          motivos: string | null
          nome: string | null
          phone_e164: string | null
          phone_normalizado: string | null
          qtd_anexos: number | null
          qtd_anotacoes: number | null
          qtd_disparos: number | null
          qtd_email_contatos: number | null
          qtd_email_interacoes: number | null
          qtd_historico: number | null
          qtd_medicos: number | null
          qtd_propostas: number | null
          rqe: string | null
          status: string | null
          tem_cpf: boolean | null
          total_registros_filhos: number | null
          uf: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      vw_leads_quentes_esperando: {
        Row: {
          campanha_id: string | null
          campanha_lead_id: string | null
          campanha_nome: string | null
          horas_esperando: number | null
          humano_assumiu: boolean | null
          lead_cidade: string | null
          lead_especialidade: string | null
          lead_id: string | null
          lead_nome: string | null
          lead_phone: string | null
          lead_uf: string | null
          quente_desde: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_leads_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
        ]
      }
      vw_produtividade_disparos: {
        Row: {
          campanhas_criadas: number | null
          conversoes: number | null
          manuais_enviados: number | null
          manuais_total: number | null
          massa_contatos: number | null
          massa_enviados: number | null
          massa_falhas: number | null
          nome_completo: string | null
          raias_abertas: number | null
          raias_movidas: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_trafego_pago_funil: {
        Row: {
          campanha_id: string | null
          campanha_nome: string | null
          campanha_proposta_id: string | null
          primeiro_envio: string | null
          proposta_codigo: string | null
          proposta_descricao: string | null
          proposta_id: string | null
          total_aceitaram: number | null
          total_convertidos: number | null
          total_em_conversa: number | null
          total_enviados: number | null
          total_responderam: number | null
          ultimo_envio: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_propostas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanha_propostas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "vw_campanha_metricas"
            referencedColumns: ["campanha_id"]
          },
          {
            foreignKeyName: "campanha_propostas_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "proposta"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      atualizar_status_lead_campanha: {
        Args: {
          p_campanha_id: string
          p_canal?: string
          p_lead_id: string
          p_metadados?: Json
          p_novo_status: Database["public"]["Enums"]["status_lead_campanha"]
        }
        Returns: undefined
      }
      backfill_cascata_contactados: {
        Args: { _campanha_proposta_id: string }
        Returns: number
      }
      calcular_status_resposta_atividade: {
        Args: { p_respondido_em: string; p_resposta_esperada_ate: string }
        Returns: string
      }
      cleanup_expired_edit_locks: { Args: never; Returns: undefined }
      cleanup_whatsapp_rate_limit: { Args: never; Returns: undefined }
      enviar_lead_proxima_fase: {
        Args: {
          p_campanha_proposta_id: string
          p_canal_atual: string
          p_lead_id: string
          p_motivo?: string
        }
        Returns: string
      }
      exportar_leads_trafego_pago: {
        Args: { p_campanha_id: string }
        Returns: {
          cidade: string
          email: string
          especialidade: string
          lead_id: string
          nome: string
          phone: string
          uf: string
        }[]
      }
      fechar_lead_canal: {
        Args: {
          p_campanha_proposta_id: string
          p_canal: string
          p_lead_id: string
          p_motivo: string
          p_status_final: string
        }
        Returns: undefined
      }
      find_lead_by_phone: { Args: { p_phone: string }; Returns: string }
      find_lead_by_phone_fuzzy: { Args: { p_phone: string }; Returns: string }
      fn_log_status_change: {
        Args: {
          p_lead_id: string
          p_metadados?: Json
          p_motivo: string
          p_origem: string
          p_status_anterior: string
          p_status_novo: string
        }
        Returns: undefined
      }
      generate_ticket_numero: { Args: never; Returns: string }
      gerar_disparo_zap: {
        Args: { p_campanha_proposta_id: string; p_chip_id?: string }
        Returns: Json
      }
      get_bi_prospec_dashboard: {
        Args: { p_fim: string; p_inicio: string }
        Returns: Json
      }
      get_leads_especialidade_counts: {
        Args: never
        Returns: {
          count: number
          especialidade_id: string
        }[]
      }
      get_leads_filter_counts: { Args: never; Returns: Json }
      get_or_create_empresa_concorrente: {
        Args: { p_nome: string }
        Returns: string
      }
      get_ranking_disparos: {
        Args: { p_metric?: string; p_periodo?: string }
        Returns: {
          campanhas_criadas: number
          conversoes: number
          manuais_enviados: number
          massa_enviados: number
          massa_falhas: number
          nome_completo: string
          raias_abertas: number
          raias_movidas: number
          sla_cumprido_pct: number
          sla_medio_horas: number
          user_id: string
        }[]
      }
      get_user_setor: { Args: { _user_id: string }; Returns: string }
      has_captacao_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _acao: string; _modulo: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_captacao_leader: { Args: { _user_id: string }; Returns: boolean }
      is_channel_participant: {
        Args: { _canal_id: string; _user_id: string }
        Returns: boolean
      }
      is_instancia_trafego_pago: {
        Args: { p_instance_name: string }
        Returns: boolean
      }
      is_leader: { Args: { _user_id: string }; Returns: boolean }
      is_setor_leader: {
        Args: { _setor_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_session: { Args: never; Returns: boolean }
      liberar_lead_proposta: {
        Args: {
          p_campanha_proposta_id: string
          p_justificativa: string
          p_lead_id: string
          p_motivo_anterior?: string
        }
        Returns: string
      }
      log_auditoria: {
        Args: {
          p_acao: string
          p_campos_alterados?: string[]
          p_dados_antigos?: Json
          p_dados_novos?: Json
          p_detalhes?: string
          p_modulo: string
          p_registro_descricao?: string
          p_registro_id?: string
          p_tabela: string
          p_usuario_id?: string
          p_usuario_nome?: string
        }
        Returns: string
      }
      lookup_especialidade: {
        Args: { p_lead_id?: string; p_texto: string }
        Returns: string
      }
      lookup_especialidades2: {
        Args: { p_especialidade_id: string; p_lead_id: string }
        Returns: string
      }
      merge_lead_cluster: {
        Args: {
          p_batch_tag?: string
          p_canonical_id: string
          p_duplicate_id: string
        }
        Returns: Json
      }
      mover_lead_entre_propostas: {
        Args: {
          p_canal?: string
          p_lead_id: string
          p_proposta_destino: string
          p_proposta_origem: string
        }
        Returns: string
      }
      nome_is_subset: {
        Args: { p_nome1: string; p_nome2: string }
        Returns: boolean
      }
      nome_palavras: { Args: { p_nome: string }; Returns: string[] }
      nome_palavras_comuns: {
        Args: { p_nome1: string; p_nome2: string }
        Returns: number
      }
      norm_crm: { Args: { p: string }; Returns: string }
      norm_nome: { Args: { p_nome: string }; Returns: string }
      norm_phone: { Args: { p: string }; Returns: string }
      pode_encerrar_campanha: { Args: { _user_id: string }; Returns: boolean }
      processar_disparos_agendados: { Args: never; Returns: undefined }
      release_licitacao_lock: {
        Args: { p_licitacao_id: string }
        Returns: undefined
      }
      reprocessar_acompanhamento: {
        Args: never
        Returns: {
          destino: string
          quantidade: number
        }[]
      }
      search_leads_for_picker: {
        Args: {
          p_ano_max?: number
          p_ano_min?: number
          p_busca?: string
          p_cidade?: string
          p_especialidade_ids?: string[]
          p_limit?: number
          p_offset?: number
          p_only_ids?: boolean
          p_ufs?: string[]
        }
        Returns: {
          cidade: string
          data_formatura: string
          especialidade: string
          especialidade_id: string
          id: string
          nome: string
          phone_e164: string
          total_count: number
          uf: string
        }[]
      }
      seed_fase1_lead_canais: {
        Args: { p_campanha_proposta_id: string }
        Returns: number
      }
      selecionar_leads_campanha: {
        Args: { p_campanha_id: string; p_limite?: number }
        Returns: {
          cidade: string
          especialidade_nome: string
          lead_id: string
          nome: string
          phone_e164: string
          uf: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sweeper_acompanhamento_sem_resposta: { Args: never; Returns: number }
      test_automacao_kanban: {
        Args: never
        Returns: {
          cenario: string
          resultado: string
        }[]
      }
      transferir_lead_canal: {
        Args: {
          p_campanha_proposta_id: string
          p_canal_atual: string
          p_lead_id: string
          p_motivo: string
          p_proximo_canal: string
        }
        Returns: string
      }
      try_acquire_licitacao_lock: {
        Args: {
          p_licitacao_id: string
          p_lock_duration_minutes?: number
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      validate_api_token: { Args: { _token: string }; Returns: string }
      validate_escala_api_token: { Args: { _token: string }; Returns: string }
      vincular_contato_novo: {
        Args: { p_instance: string; p_lead_id: string; p_phone: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor_contratos"
        | "gestor_captacao"
        | "coordenador_escalas"
        | "gestor_financeiro"
        | "diretoria"
        | "gestor_radiologia"
        | "gestor_marketing"
        | "externos"
        | "lideres"
        | "gestor_ages"
      canal_campanha:
        | "whatsapp"
        | "email"
        | "instagram"
        | "linkedin"
        | "anuncios"
        | "eventos"
      categoria_material:
        | "pdf"
        | "apresentacao"
        | "modelo_mensagem"
        | "logo"
        | "template"
        | "politica_interna"
      categoria_patrimonio:
        | "equipamento"
        | "mobiliario"
        | "veiculo"
        | "informatica"
        | "outros"
        | "equipamento_hospitalar"
      classificacao_gss_licitacao:
        | "primeiro_lugar"
        | "segundo_lugar"
        | "desclassificada"
        | "nao_habilitada"
      destino_suporte: "interno" | "externo"
      especialidade_cliente: "Hospital" | "Clínica" | "UBS" | "Outros"
      estado_conservacao: "novo" | "usado" | "danificado" | "inservivel"
      etapa_funil_marketing:
        | "lead_gerado"
        | "contato_inicial"
        | "envio_informacoes"
        | "qualificacao"
        | "encaminhado_captacao"
        | "processo_contratacao"
        | "plantao_agendado"
      fornecedor_externo: "dr_escala" | "infra_ti"
      motivo_ajuste_laudo:
        | "Erro de digitação"
        | "Informação clínica incompleta"
        | "Padrão fora do protocolo"
        | "Solicitado pelo cliente"
        | "Outro"
      motivo_ausencia:
        | "ferias"
        | "atestado_medico"
        | "congresso"
        | "viagem"
        | "folga"
        | "outro"
      motivo_indisponibilidade:
        | "Viagem"
        | "Férias"
        | "Motivos pessoais"
        | "Problemas de saúde"
      motivo_perda_licitacao:
        | "preco"
        | "documentacao"
        | "prazo"
        | "habilitacao_tecnica"
        | "estrategia"
        | "outros"
      nivel_urgencia_radiologia: "pronto_socorro" | "internados" | "oncologicos"
      nivel_urgencia_suporte: "critica" | "alta" | "media" | "baixa"
      origem_tipo_board: "manual" | "licitacao_arrematada"
      segmento_radiologia: "RX" | "TC" | "US" | "RM" | "MM"
      status_ajuste_laudo: "Pendente" | "Em Ajuste" | "Ajustado"
      status_assinatura: "pendente" | "assinado" | "cancelado"
      status_assinatura_contrato:
        | "Sim"
        | "Pendente"
        | "Em Análise"
        | "Aguardando Retorno"
      status_campanha:
        | "planejada"
        | "ativa"
        | "pausada"
        | "finalizada"
        | "rascunho"
        | "agendada"
        | "arquivada"
      status_captacao_board:
        | "prospectar"
        | "analisando"
        | "em_andamento"
        | "completo"
        | "descarte"
      status_cliente: "Ativo" | "Inativo" | "Suspenso" | "Cancelado"
      status_conteudo: "rascunho" | "pronto" | "publicado"
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
      status_lead_campanha:
        | "frio"
        | "contatado"
        | "em_conversa"
        | "aquecido"
        | "quente"
        | "convertido"
        | "sem_resposta"
        | "descartado"
      status_licitacao:
        | "captacao_edital"
        | "edital_analise"
        | "conferencia"
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
        | "suspenso_revogado"
        | "nao_ganhamos"
        | "capitacao_de_credenciamento"
      status_medico: "Ativo" | "Inativo" | "Suspenso"
      status_pagamento: "pendente" | "pago" | "atrasado" | "cancelado"
      status_patrimonio: "ativo" | "transferido" | "baixado"
      status_proposta: "pendente" | "aceita" | "recusada"
      status_relacionamento:
        | "inicio_identificacao"
        | "captacao_documentacao"
        | "pendencia_documentacao"
        | "documentacao_finalizada"
        | "criacao_escalas"
      status_ticket:
        | "pendente"
        | "em_analise"
        | "concluido"
        | "aberto"
        | "aguardando_usuario"
        | "em_validacao"
        | "aguardando_confirmacao"
        | "resolvido"
      tipo_conteudo: "video" | "card" | "reels" | "artigo" | "newsletter"
      tipo_contratacao:
        | "credenciamento"
        | "licitacao"
        | "dispensa"
        | "direta_privada"
      tipo_contrato: "licitacao" | "privado"
      tipo_disparo_enum: "zap" | "email" | "outros"
      tipo_documento_medico:
        | "diploma"
        | "certificado"
        | "rg"
        | "cpf"
        | "crm"
        | "rqe"
        | "titulo_especialista"
        | "comprovante_residencia"
        | "certidao"
        | "carta_recomendacao"
        | "outro"
        | "link_externo"
        | "contrato_aditivo"
      tipo_evento_lead:
        | "disparo_email"
        | "disparo_zap"
        | "proposta_enviada"
        | "proposta_aceita"
        | "proposta_recusada"
        | "convertido_em_medico"
        | "atendimento"
        | "contato_telefonico"
        | "reuniao_agendada"
        | "documentacao_solicitada"
        | "documentacao_recebida"
        | "outro"
        | "desconvertido_para_lead"
        | "reprocessado_kanban"
        | "enviado_acompanhamento"
        | "lead_editado"
        | "lead_criado"
        | "status_alterado"
        | "lead_qualificado"
        | "em_resposta"
        | "lead_descartado"
        | "export_trafego_pago"
        | "inbound_whatsapp"
        | "outbound_whatsapp"
        | "inbound_email"
        | "inbound_instagram"
        | "campanha_status_change"
        | "campanha_disparo"
        | "lead_aquecido"
        | "lead_quente_handoff"
        | "canal_encerrado"
        | "campanha_encerrada"
        | "disparo_manual"
        | "opt_out_lgpd"
        | "classificacao_alterada"
        | "cooldown_alterado"
        | "contato_vinculado"
        | "perfil_extraido"
        | "email_enviado"
        | "email_falhou"
        | "email_respondido"
        | "qa_pergunta_enviada"
        | "qa_resposta_relayed"
      tipo_impacto_suporte:
        | "sistema"
        | "infraestrutura"
        | "acesso_permissao"
        | "integracao"
        | "duvida_operacional"
        | "melhoria"
      tipo_relacionamento:
        | "Reclamação"
        | "Feedback Positivo"
        | "Alinhamento Escalas"
        | "Ação Comemorativa"
      tipo_suporte: "software" | "hardware"
      user_status: "ativo" | "inativo" | "suspenso"
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
        "gestor_contratos",
        "gestor_captacao",
        "coordenador_escalas",
        "gestor_financeiro",
        "diretoria",
        "gestor_radiologia",
        "gestor_marketing",
        "externos",
        "lideres",
        "gestor_ages",
      ],
      canal_campanha: [
        "whatsapp",
        "email",
        "instagram",
        "linkedin",
        "anuncios",
        "eventos",
      ],
      categoria_material: [
        "pdf",
        "apresentacao",
        "modelo_mensagem",
        "logo",
        "template",
        "politica_interna",
      ],
      categoria_patrimonio: [
        "equipamento",
        "mobiliario",
        "veiculo",
        "informatica",
        "outros",
        "equipamento_hospitalar",
      ],
      classificacao_gss_licitacao: [
        "primeiro_lugar",
        "segundo_lugar",
        "desclassificada",
        "nao_habilitada",
      ],
      destino_suporte: ["interno", "externo"],
      especialidade_cliente: ["Hospital", "Clínica", "UBS", "Outros"],
      estado_conservacao: ["novo", "usado", "danificado", "inservivel"],
      etapa_funil_marketing: [
        "lead_gerado",
        "contato_inicial",
        "envio_informacoes",
        "qualificacao",
        "encaminhado_captacao",
        "processo_contratacao",
        "plantao_agendado",
      ],
      fornecedor_externo: ["dr_escala", "infra_ti"],
      motivo_ajuste_laudo: [
        "Erro de digitação",
        "Informação clínica incompleta",
        "Padrão fora do protocolo",
        "Solicitado pelo cliente",
        "Outro",
      ],
      motivo_ausencia: [
        "ferias",
        "atestado_medico",
        "congresso",
        "viagem",
        "folga",
        "outro",
      ],
      motivo_indisponibilidade: [
        "Viagem",
        "Férias",
        "Motivos pessoais",
        "Problemas de saúde",
      ],
      motivo_perda_licitacao: [
        "preco",
        "documentacao",
        "prazo",
        "habilitacao_tecnica",
        "estrategia",
        "outros",
      ],
      nivel_urgencia_radiologia: [
        "pronto_socorro",
        "internados",
        "oncologicos",
      ],
      nivel_urgencia_suporte: ["critica", "alta", "media", "baixa"],
      origem_tipo_board: ["manual", "licitacao_arrematada"],
      segmento_radiologia: ["RX", "TC", "US", "RM", "MM"],
      status_ajuste_laudo: ["Pendente", "Em Ajuste", "Ajustado"],
      status_assinatura: ["pendente", "assinado", "cancelado"],
      status_assinatura_contrato: [
        "Sim",
        "Pendente",
        "Em Análise",
        "Aguardando Retorno",
      ],
      status_campanha: [
        "planejada",
        "ativa",
        "pausada",
        "finalizada",
        "rascunho",
        "agendada",
        "arquivada",
      ],
      status_captacao_board: [
        "prospectar",
        "analisando",
        "em_andamento",
        "completo",
        "descarte",
      ],
      status_cliente: ["Ativo", "Inativo", "Suspenso", "Cancelado"],
      status_conteudo: ["rascunho", "pronto", "publicado"],
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
      status_lead_campanha: [
        "frio",
        "contatado",
        "em_conversa",
        "aquecido",
        "quente",
        "convertido",
        "sem_resposta",
        "descartado",
      ],
      status_licitacao: [
        "captacao_edital",
        "edital_analise",
        "conferencia",
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
        "suspenso_revogado",
        "nao_ganhamos",
        "capitacao_de_credenciamento",
      ],
      status_medico: ["Ativo", "Inativo", "Suspenso"],
      status_pagamento: ["pendente", "pago", "atrasado", "cancelado"],
      status_patrimonio: ["ativo", "transferido", "baixado"],
      status_proposta: ["pendente", "aceita", "recusada"],
      status_relacionamento: [
        "inicio_identificacao",
        "captacao_documentacao",
        "pendencia_documentacao",
        "documentacao_finalizada",
        "criacao_escalas",
      ],
      status_ticket: [
        "pendente",
        "em_analise",
        "concluido",
        "aberto",
        "aguardando_usuario",
        "em_validacao",
        "aguardando_confirmacao",
        "resolvido",
      ],
      tipo_conteudo: ["video", "card", "reels", "artigo", "newsletter"],
      tipo_contratacao: [
        "credenciamento",
        "licitacao",
        "dispensa",
        "direta_privada",
      ],
      tipo_contrato: ["licitacao", "privado"],
      tipo_disparo_enum: ["zap", "email", "outros"],
      tipo_documento_medico: [
        "diploma",
        "certificado",
        "rg",
        "cpf",
        "crm",
        "rqe",
        "titulo_especialista",
        "comprovante_residencia",
        "certidao",
        "carta_recomendacao",
        "outro",
        "link_externo",
        "contrato_aditivo",
      ],
      tipo_evento_lead: [
        "disparo_email",
        "disparo_zap",
        "proposta_enviada",
        "proposta_aceita",
        "proposta_recusada",
        "convertido_em_medico",
        "atendimento",
        "contato_telefonico",
        "reuniao_agendada",
        "documentacao_solicitada",
        "documentacao_recebida",
        "outro",
        "desconvertido_para_lead",
        "reprocessado_kanban",
        "enviado_acompanhamento",
        "lead_editado",
        "lead_criado",
        "status_alterado",
        "lead_qualificado",
        "em_resposta",
        "lead_descartado",
        "export_trafego_pago",
        "inbound_whatsapp",
        "outbound_whatsapp",
        "inbound_email",
        "inbound_instagram",
        "campanha_status_change",
        "campanha_disparo",
        "lead_aquecido",
        "lead_quente_handoff",
        "canal_encerrado",
        "campanha_encerrada",
        "disparo_manual",
        "opt_out_lgpd",
        "classificacao_alterada",
        "cooldown_alterado",
        "contato_vinculado",
        "perfil_extraido",
        "email_enviado",
        "email_falhou",
        "email_respondido",
        "qa_pergunta_enviada",
        "qa_resposta_relayed",
      ],
      tipo_impacto_suporte: [
        "sistema",
        "infraestrutura",
        "acesso_permissao",
        "integracao",
        "duvida_operacional",
        "melhoria",
      ],
      tipo_relacionamento: [
        "Reclamação",
        "Feedback Positivo",
        "Alinhamento Escalas",
        "Ação Comemorativa",
      ],
      tipo_suporte: ["software", "hardware"],
      user_status: ["ativo", "inativo", "suspenso"],
    },
  },
} as const
