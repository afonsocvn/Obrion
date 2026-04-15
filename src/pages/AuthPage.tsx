import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

const features = [
  'Gestão de projetos de obra',
  'Biblioteca de materiais e mão de obra',
  'Geração automática de mapas de trabalho',
  'Cálculo de custos por fração',
  'Templates de divisões reutilizáveis',
];

export default function AuthPage() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setLoginLoading(false);
    if (error) {
      setLoginError('Email ou password incorretos. Tente novamente.');
    } else {
      navigate('/');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');

    if (registerPassword !== registerConfirm) {
      setRegisterError('As passwords não coincidem.');
      return;
    }
    if (registerPassword.length < 6) {
      setRegisterError('A password deve ter pelo menos 6 caracteres.');
      return;
    }

    setRegisterLoading(true);
    const { error } = await signUp(registerEmail, registerPassword);
    setRegisterLoading(false);

    if (error) {
      setRegisterError('Erro ao criar conta. Verifique os dados e tente novamente.');
    } else {
      setRegisterSuccess('Conta criada! Verifique o seu email para confirmar o registo.');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - brand */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-blue-400" />
          <span className="text-2xl font-bold tracking-tight">Obrion</span>
        </div>

        <div className="space-y-8">
          <div>
            <h1 className="text-4xl font-bold leading-tight mb-4">
              Gestão de obras simplificada
            </h1>
            <p className="text-gray-400 text-lg">
              Controle orçamentos, materiais e mão de obra num só lugar.
            </p>
          </div>

          <ul className="space-y-3">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-blue-400 shrink-0" />
                <span className="text-gray-300">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-gray-600 text-sm">© 2026 Obrion. Todos os direitos reservados.</p>
      </div>

      {/* Right panel - auth forms */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <Building2 className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold">Obrion</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Bem-vindo</h2>
            <p className="text-gray-500 mt-1">Entre na sua conta ou crie uma nova.</p>
          </div>

          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="registar">Registar</TabsTrigger>
            </TabsList>

            {/* Login tab */}
            <TabsContent value="entrar">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                {loginError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {loginError}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? 'A entrar...' : 'Entrar'}
                </Button>
              </form>
            </TabsContent>

            {/* Register tab */}
            <TabsContent value="registar">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <Input
                    id="register-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={registerEmail}
                    onChange={(e) => setRegisterEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-confirm">Confirmar Password</Label>
                  <Input
                    id="register-confirm"
                    type="password"
                    placeholder="Repita a password"
                    value={registerConfirm}
                    onChange={(e) => setRegisterConfirm(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>

                {registerError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {registerError}
                  </p>
                )}
                {registerSuccess && (
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                    {registerSuccess}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={registerLoading}>
                  {registerLoading ? 'A criar conta...' : 'Criar conta'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
