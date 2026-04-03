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
          nome_unidade: string | null
          telefone: string
          telefone_financeiro: string | null
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
          nome_unidade?: string | null
          telefone: string
          telefone_financeiro?: string | null
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
          nome_unidade?: string | null
          telefone?: string
          telefone_financeiro?: string | null
          updated_at?: string | null
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
          created_at: string | null
          crm: string
          documentos_url: string[] | null
          email: string
          especialidade: string
          id: string
          nome_completo: string
          status_documentacao: Database["public"]["Enums"]["status_documentacao"]
          telefone: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          crm: string
          documentos_url?: string[] | null
          email: string
          especialidade: string
          id?: string
          nome_completo: string
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          telefone: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          crm?: string
          documentos_url?: string[] | null
          email?: string
          especialidade?: string
          id?: string
          nome_completo?: string
          status_documentacao?: Database["public"]["Enums"]["status_documentacao"]
          telefone?: string
          updated_at?: string | null
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
      status_assinatura: "pendente" | "assinado" | "cancelado"
      status_contrato: "ativo" | "inativo" | "suspenso"
      status_demanda: "aberta" | "em_atendimento" | "concluida" | "cancelada"
      status_documentacao: "pendente" | "em_analise" | "aprovada" | "reprovada"
      status_execucao: "pendente" | "executada" | "cancelada"
      status_pagamento: "pendente" | "pago" | "atrasado" | "cancelado"
      status_proposta: "pendente" | "aceita" | "recusada"
      tipo_contrato: "licitacao" | "privado"
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
      status_assinatura: ["pendente", "assinado", "cancelado"],
      status_contrato: ["ativo", "inativo", "suspenso"],
      status_demanda: ["aberta", "em_atendimento", "concluida", "cancelada"],
      status_documentacao: ["pendente", "em_analise", "aprovada", "reprovada"],
      status_execucao: ["pendente", "executada", "cancelada"],
      status_pagamento: ["pendente", "pago", "atrasado", "cancelado"],
      status_proposta: ["pendente", "aceita", "recusada"],
      tipo_contrato: ["licitacao", "privado"],
    },
  },
} as const
