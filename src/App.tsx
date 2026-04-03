import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PermissionRoute } from "@/components/auth/PermissionRoute";
import Dashboard from "./pages/Dashboard";
import Licitacoes from "./pages/Licitacoes";
import Disparos from "./pages/Disparos";
import DisparosZap from "./pages/DisparosZap";
import DisparosEmail from "./pages/DisparosEmail";
import DisparosAcompanhamento from "./pages/DisparosAcompanhamento";
import DisparosLeads from "./pages/DisparosLeads";
import DisparosBlackList from "./pages/DisparosBlackList";
import DisparosSigZap from "./pages/DisparosSigZap";
import DisparosConfig from "./pages/DisparosConfig";
import DisparosContratos from "./pages/DisparosContratos";
import Captadores from "./pages/Captadores";
import DisparosRegiaoInteresse from "./pages/DisparosRegiaoInteresse";
import DisparosMonitor from "./pages/DisparosMonitor";
import DisparosResidentes from "./pages/DisparosResidentes";
import Contratos from "./pages/Contratos";
import RelacionamentoMedico from "./pages/RelacionamentoMedico";
import Medicos from "./pages/Medicos";
import Escalas from "./pages/Escalas";
import Financeiro from "./pages/Financeiro";
import Patrimonio from "./pages/Patrimonio";
import BI from "./pages/BI";
import Configuracoes from "./pages/Configuracoes";
import Radiologia from "./pages/Radiologia";
import Suporte from "./pages/Suporte";
import Comunicacao from "./pages/Comunicacao";
import SigZap from "./pages/SigZap";
import Marketing from "./pages/Marketing";
import Auditoria from "./pages/Auditoria";
import Ages from "./pages/Ages";
import Workspace from "./pages/Workspace";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminImport from "./pages/AdminImport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/comunicacao" element={<ProtectedRoute><PermissionRoute modulo="comunicacao"><Comunicacao /></PermissionRoute></ProtectedRoute>} />
            <Route path="/licitacoes" element={<ProtectedRoute><PermissionRoute modulo="licitacoes"><Licitacoes /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos" element={<ProtectedRoute><PermissionRoute modulo="disparos"><Disparos /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/zap" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosZap /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/email" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosEmail /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/acompanhamento" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosAcompanhamento /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/leads" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosLeads /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/blacklist" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosBlackList /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/sigzap" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosSigZap /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/config" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosConfig /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/contratos" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosContratos /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/captadores" element={<ProtectedRoute><PermissionRoute modulo="disparos"><Captadores /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/regiao-interesse" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosRegiaoInteresse /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/monitor" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosMonitor /></PermissionRoute></ProtectedRoute>} />
            <Route path="/disparos/residentes" element={<ProtectedRoute><PermissionRoute modulo="disparos"><DisparosResidentes /></PermissionRoute></ProtectedRoute>} />
            <Route path="/marketing" element={<ProtectedRoute><PermissionRoute modulo="marketing"><Marketing /></PermissionRoute></ProtectedRoute>} />
            <Route path="/contratos" element={<ProtectedRoute><PermissionRoute modulo="contratos"><Contratos /></PermissionRoute></ProtectedRoute>} />
            <Route path="/relacionamento-medico" element={<ProtectedRoute><PermissionRoute modulo="relacionamento"><RelacionamentoMedico /></PermissionRoute></ProtectedRoute>} />
            <Route path="/medicos" element={<ProtectedRoute><PermissionRoute modulo="medicos"><Medicos /></PermissionRoute></ProtectedRoute>} />
            <Route path="/escalas" element={<ProtectedRoute><PermissionRoute modulo="escalas"><Escalas /></PermissionRoute></ProtectedRoute>} />
            <Route path="/financeiro" element={<ProtectedRoute><PermissionRoute modulo="financeiro"><Financeiro /></PermissionRoute></ProtectedRoute>} />
            <Route path="/patrimonio" element={<ProtectedRoute><PermissionRoute modulo="patrimonio"><Patrimonio /></PermissionRoute></ProtectedRoute>} />
            <Route path="/radiologia" element={<ProtectedRoute><PermissionRoute modulo="radiologia"><Radiologia /></PermissionRoute></ProtectedRoute>} />
            <Route path="/bi" element={<ProtectedRoute><PermissionRoute modulo="bi"><BI /></PermissionRoute></ProtectedRoute>} />
            <Route path="/sigzap" element={<ProtectedRoute><PermissionRoute modulo="sigzap"><SigZap /></PermissionRoute></ProtectedRoute>} />
            <Route path="/suporte" element={<ProtectedRoute><PermissionRoute modulo="suporte"><Suporte /></PermissionRoute></ProtectedRoute>} />
            <Route path="/auditoria" element={<ProtectedRoute><PermissionRoute adminOnly><Auditoria /></PermissionRoute></ProtectedRoute>} />
            <Route path="/ages" element={<ProtectedRoute><PermissionRoute modulo="ages"><Ages /></PermissionRoute></ProtectedRoute>} />
            <Route path="/workspace" element={<ProtectedRoute><Workspace /></ProtectedRoute>} />
            <Route path="/configuracoes" element={<ProtectedRoute><PermissionRoute adminOnly><Configuracoes /></PermissionRoute></ProtectedRoute>} />
            <Route path="/admin-import" element={<AdminImport />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
