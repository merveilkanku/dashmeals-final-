import React, { useState, useEffect } from 'react';
import { 
  Users, Store, ShoppingBag, DollarSign, Activity, 
  Search, CheckCircle, XCircle, LogOut, Shield, 
  Trash2, AlertTriangle, Database, Type, Sun, Moon, Menu, X,
  Eye, Download, FileText
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { APP_LOGO_URL } from '../constants';
import { User, Restaurant, Order, Theme, Language, AppFont } from '../types';
import { toast } from 'sonner';

interface Props {
  user: User;
  onLogout: () => void;
  theme?: Theme;
  setTheme?: (t: Theme) => void;
  language?: Language;
  setLanguage?: (l: Language) => void;
  font?: AppFont;
  setFont?: (f: AppFont) => void;
}

type AdminView = 'overview' | 'users' | 'restaurants' | 'publications' | 'verifications' | 'products';

export const SuperAdminDashboard: React.FC<Props> = ({ user, onLogout, theme, setTheme, language, setLanguage, font, setFont }) => {
  const [activeView, setActiveView] = useState<AdminView>('overview');
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalRestaurants: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingVerifications: 0
  });
  const [users, setUsers] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<Restaurant[]>([]);
  const [publications, setPublications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (activeView === 'users') fetchUsers();
    if (activeView === 'restaurants') fetchRestaurants();
    if (activeView === 'verifications') fetchPendingVerifications();
    if (activeView === 'publications') fetchPublications();
  }, [activeView]);

  const handleNavigation = (view: AdminView) => {
      setActiveView(view);
      setIsMobileMenuOpen(false);
  };

  const fetchStats = async () => {
    try {
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: restoCount } = await supabase.from('restaurants').select('*', { count: 'exact', head: true });
      const { count: orderCount } = await supabase.from('orders').select('*', { count: 'exact', head: true });
      const { count: verificationCount } = await supabase.from('restaurants').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending');
      
      setStats({
        totalUsers: userCount || 0,
        totalRestaurants: restoCount || 0,
        totalOrders: orderCount || 0,
        totalRevenue: (orderCount || 0) * 25,
        pendingVerifications: verificationCount || 0
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (data) setUsers(data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
    setLoading(false);
  };

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('restaurants').select('*').order('created_at', { ascending: false });
      if (data) setRestaurants(data.map((r: any) => ({
          ...r,
          ownerId: r.owner_id,
          reviewCount: r.review_count,
          preparationTime: r.preparation_time,
          estimatedDeliveryTime: r.estimated_delivery_time,
          deliveryAvailable: r.delivery_available,
          coverImage: r.cover_image,
          menu: []
      })));
    } catch (error) {
      console.error("Error fetching restaurants:", error);
    }
    setLoading(false);
  };

  const fetchPendingVerifications = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
          .from('restaurants')
          .select('*')
          .eq('verification_status', 'pending')
          .order('created_at', { ascending: false });
          
      if (data) setPendingVerifications(data.map((r: any) => ({
          ...r,
          ownerId: r.owner_id,
          reviewCount: r.review_count,
          preparationTime: r.preparation_time,
          estimatedDeliveryTime: r.estimated_delivery_time,
          deliveryAvailable: r.delivery_available,
          coverImage: r.cover_image,
          verificationStatus: r.verification_status,
          verificationDocs: r.verification_docs,
          verificationPaymentStatus: r.verification_payment_status,
          menu: []
      })));
    } catch (error) {
      console.error("Error fetching verifications:", error);
    }
    setLoading(false);
  };

  const fetchPublications = async () => {
    setLoading(true);
    try {
      const { data: menuData } = await supabase
          .from('menu_items')
          .select('*, restaurants(name)')
          .order('created_at', { ascending: false });
          
      const { data: promoData } = await supabase
          .from('promotions')
          .select('*, restaurants(name)')
          .order('created_at', { ascending: false });
          
      const combined = [
          ...(menuData || []).map((m: any) => ({ ...m, pubType: 'menu_item', restaurantName: m.restaurants?.name })),
          ...(promoData || []).map((p: any) => ({ ...p, pubType: 'promotion', restaurantName: p.restaurants?.name }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setPublications(combined);
    } catch (error) {
      console.error("Error fetching publications:", error);
    }
    setLoading(false);
  };

  const togglePublicationStatus = async (pub: any) => {
      const table = pub.pubType === 'menu_item' ? 'menu_items' : 'promotions';
      const currentStatus = pub.pubType === 'menu_item' ? pub.is_available : pub.is_active;
      const updateField = pub.pubType === 'menu_item' ? { is_available: !currentStatus } : { is_active: !currentStatus };
      
      const { error } = await supabase.from(table).update(updateField).eq('id', pub.id);
      if (error) {
          if (error.code === '42703') {
              toast.error("La colonne is_active n'existe pas encore pour les promotions. Veuillez exécuter la commande SQL fournie.");
          } else {
              toast.error("Erreur lors de la modification");
          }
      } else {
          toast.success("Statut mis à jour !");
          fetchPublications();
      }
  };

  const deletePublication = async (pub: any) => {
      if (!window.confirm("Êtes-vous sûr de vouloir supprimer cette publication ?")) return;
      const table = pub.pubType === 'menu_item' ? 'menu_items' : 'promotions';
      const { error } = await supabase.from(table).delete().eq('id', pub.id);
      if (error) {
          toast.error("Erreur lors de la suppression");
      } else {
          toast.success("Publication supprimée !");
          fetchPublications();
      }
  };

  const handleVerification = async (restoId: string, status: 'verified' | 'rejected') => {
      if (!confirm(`Confirmer le statut : ${status} ?`)) return;
      
      try {
          const { error } = await supabase.from('restaurants').update({
              verification_status: status,
              is_verified: status === 'verified'
          }).eq('id', restoId);
          
          if (error) throw error;
          
          toast.success(`Restaurant ${status === 'verified' ? 'vérifié' : 'rejeté'} avec succès !`);
          fetchPendingVerifications();
          fetchStats();
      } catch (error) {
          console.error("Verification error:", error);
          toast.error("Erreur lors de la mise à jour");
      }
  };

  const toggleUserVerification = async (userId: string, currentStatus: boolean) => {
      toast.info(`Compte utilisateur ${userId} ${currentStatus ? 'invalidé' : 'validé'} (Simulation)`);
      fetchUsers();
  };

  const changeUserRole = async (userId: string, currentRole: string) => {
      const newRole = currentRole === 'business' ? 'client' : 'business';
      if(!window.confirm(`Êtes-vous sûr de vouloir changer le rôle de cet utilisateur en ${newRole} ?`)) return;
      
      const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
      if (error) {
          toast.error("Erreur lors du changement de rôle");
          console.error(error);
      } else {
          toast.success(`Rôle changé avec succès en ${newRole}`);
          fetchUsers();
      }
  };

  const deleteUser = async (userId: string) => {
      if(!window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ? Cette action supprimera son profil public.")) return;
      
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) {
          toast.error("Erreur lors de la suppression du profil");
          console.error(error);
      } else {
          toast.success("Profil utilisateur supprimé avec succès");
          fetchUsers();
      }
  };

  const viewDocument = async (documentUrl: string) => {
      if (!documentUrl) {
          toast.error("Aucun document disponible");
          return;
      }
      setSelectedDocument(documentUrl);
      window.open(documentUrl, '_blank');
  };

  const downloadDocument = async (documentUrl: string, fileName: string) => {
      try {
          const response = await fetch(documentUrl);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          toast.success("Téléchargement démarré");
      } catch (error) {
          console.error("Download error:", error);
          toast.error("Erreur lors du téléchargement");
      }
  };

  // Filtrer les utilisateurs par recherche
  const filteredUsers = users.filter(u => 
      (u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
       u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       u.id?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const renderOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-blue-100 dark:bg-blue-900/20 p-3 rounded-xl text-blue-600 dark:text-blue-400">
            <Users size={24} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase">Utilisateurs</span>
        </div>
        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalUsers}</p>
        <p className="text-xs text-green-500 font-bold mt-2 flex items-center"><Activity size={12} className="mr-1"/> Actifs</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-orange-100 dark:bg-orange-900/20 p-3 rounded-xl text-orange-600 dark:text-orange-400">
            <Store size={24} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase">Restaurants</span>
        </div>
        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalRestaurants}</p>
        <p className="text-xs text-gray-400 font-bold mt-2">Partenaires actifs</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-purple-100 dark:bg-purple-900/20 p-3 rounded-xl text-purple-600 dark:text-purple-400">
            <ShoppingBag size={24} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase">Commandes</span>
        </div>
        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.totalOrders}</p>
        <p className="text-xs text-green-500 font-bold mt-2 flex items-center"><Activity size={12} className="mr-1"/> Total</p>
      </div>

      <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="bg-green-100 dark:bg-green-900/20 p-3 rounded-xl text-green-600 dark:text-green-400">
            <Shield size={24} />
          </div>
          <span className="text-xs font-bold text-gray-400 uppercase">En attente</span>
        </div>
        <p className="text-3xl font-black text-gray-900 dark:text-white">{stats.pendingVerifications}</p>
        <p className="text-xs text-yellow-500 font-bold mt-2">Vérifications requises</p>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row justify-between items-center gap-4">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Gestion Utilisateurs</h3>
            <div className="relative w-full md:w-auto">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input 
                    type="text" 
                    placeholder="Rechercher..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full md:w-64 pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border-none rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none dark:text-white" 
                />
            </div>
        </div>
        
        <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Utilisateur</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Rôle</th>
                        <th className="px-6 py-4">Ville</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredUsers.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-900 dark:text-white">{u.full_name || 'Sans nom'}</div>
                                <div className="text-xs text-gray-400">{u.id.slice(0, 8)}...</div>
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.email || '-'}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-md text-xs font-bold ${u.role === 'business' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                                    {u.role === 'business' ? 'Restaurateur' : 'Client'}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{u.city || '-'}</td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button onClick={() => changeUserRole(u.id, u.role)} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Changer le rôle">
                                    <Users size={18} />
                                </button>
                                <button onClick={() => deleteUser(u.id)} className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Supprimer">
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        <div className="md:hidden p-4 space-y-4">
            {filteredUsers.map(u => (
                <div key={u.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 border border-gray-100 dark:border-gray-600 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                        <div>
                            <div className="font-bold text-gray-900 dark:text-white">{u.full_name || 'Sans nom'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${u.role === 'business' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'}`}>
                            {u.role === 'business' ? 'Restaurateur' : 'Client'}
                        </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 mb-4">
                        <div className="flex items-center">
                            <span className="text-gray-400 dark:text-gray-500 mr-1">Ville:</span> {u.city || '-'}
                        </div>
                        <div className="flex items-center">
                            <span className="text-gray-400 dark:text-gray-500 mr-1">ID:</span> {u.id.slice(0, 8)}...
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                        <button onClick={() => changeUserRole(u.id, u.role)} className="p-2 bg-white dark:bg-gray-800 rounded-lg text-gray-400 hover:text-blue-600 shadow-sm border border-gray-200 dark:border-gray-600">
                            <Users size={16} />
                        </button>
                        <button onClick={() => deleteUser(u.id)} className="p-2 bg-white dark:bg-gray-800 rounded-lg text-gray-400 hover:text-red-500 shadow-sm border border-gray-200 dark:border-gray-600">
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
  );

  const renderVerifications = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Demandes de Vérification</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Consultez les documents et validez ou rejetez les demandes</p>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Restaurant</th>
                        <th className="px-6 py-4">Propriétaire</th>
                        <th className="px-6 py-4">Documents</th>
                        <th className="px-6 py-4">Paiement</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {pendingVerifications.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-gray-500 dark:text-gray-400">
                                <CheckCircle size={48} className="mx-auto mb-3 text-green-500" />
                                Aucune demande en attente
                            </td>
                        </tr>
                    ) : (
                        pendingVerifications.map(r => (
                            <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-900 dark:text-white">{r.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{r.city}</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-700 dark:text-gray-300">ID: {r.ownerId?.slice(0, 8)}...</div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="space-y-2">
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                            <span className="font-bold">RCCM:</span> {r.verificationDocs?.registryNumber || 'N/A'}
                                        </div>
                                        {r.verificationDocs?.idCardUrl && (
                                            <div className="flex space-x-2">
                                                <button 
                                                    onClick={() => viewDocument(r.verificationDocs.idCardUrl)}
                                                    className="text-blue-600 dark:text-blue-400 hover:underline text-xs flex items-center"
                                                >
                                                    <Eye size={12} className="mr-1"/> Voir carte d'identité
                                                </button>
                                                <button 
                                                    onClick={() => downloadDocument(r.verificationDocs.idCardUrl, `id_card_${r.name}.pdf`)}
                                                    className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-xs flex items-center"
                                                >
                                                    <Download size={12} className="mr-1"/> Télécharger
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    {r.verificationPaymentStatus === 'paid' ? (
                                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md text-xs font-bold flex items-center w-fit">
                                            <CheckCircle size={12} className="mr-1"/> Payé
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-md text-xs font-bold flex items-center w-fit">
                                            <XCircle size={12} className="mr-1"/> Non Payé
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button 
                                        onClick={() => handleVerification(r.id, 'verified')}
                                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors"
                                    >
                                        <CheckCircle size={14} className="inline mr-1" /> Valider
                                    </button>
                                    <button 
                                        onClick={() => handleVerification(r.id, 'rejected')}
                                        className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                    >
                                        <XCircle size={14} className="inline mr-1" /> Rejeter
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderRestaurants = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Gestion Restaurants</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-bold uppercase text-xs">
                    <tr>
                        <th className="px-6 py-4">Restaurant</th>
                        <th className="px-6 py-4">Type</th>
                        <th className="px-6 py-4">Ville</th>
                        <th className="px-6 py-4">Statut</th>
                        <th className="px-6 py-4">Vérifié</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {restaurants.map(r => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <img src={r.coverImage} className="w-10 h-10 rounded-lg object-cover mr-3" alt="" />
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white">{r.name}</div>
                                        <div className="text-xs text-gray-400">{r.isOpen ? 'Ouvert' : 'Fermé'}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs font-medium uppercase text-gray-700 dark:text-gray-300">{r.type}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{r.city}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.isOpen ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                    {r.isOpen ? 'Actif' : 'Fermé'}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {r.isVerified ? (
                                    <CheckCircle size={16} className="text-green-500" />
                                ) : (
                                    <XCircle size={16} className="text-gray-400" />
                                )}
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                    <Eye size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );

  const renderPublications = () => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-lg text-gray-800 dark:text-white">Toutes les Publications</h3>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                        <th className="p-4 font-medium">Type</th>
                        <th className="p-4 font-medium">Restaurant</th>
                        <th className="p-4 font-medium">Contenu</th>
                        <th className="p-4 font-medium">Date</th>
                        <th className="p-4 font-medium">Statut</th>
                        <th className="p-4 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {publications.map((pub: any) => (
                        <tr key={pub.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${pub.pubType === 'menu_item' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'}`}>
                                    {pub.pubType === 'menu_item' ? 'Plat' : 'Promotion'}
                                </span>
                            </td>
                            <td className="p-4 font-medium text-gray-900 dark:text-white">{pub.restaurantName || 'Inconnu'}</td>
                            <td className="p-4 text-gray-600 dark:text-gray-300">
                                {pub.pubType === 'menu_item' ? (
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">{pub.name}</p>
                                        <p className="text-xs">{pub.price} {pub.currency || 'USD'}</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-sm truncate max-w-xs">{pub.caption || 'Sans légende'}</p>
                                        {pub.media_url && (
                                            <a href={pub.media_url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-400 hover:underline">
                                                Voir le média
                                            </a>
                                        )}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">{new Date(pub.created_at).toLocaleDateString()}</td>
                            <td className="p-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400'}`}>
                                    {(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? 'Visible' : 'Masqué'}
                                </span>
                            </td>
                            <td className="p-4 text-right space-x-2">
                                <button 
                                    onClick={() => togglePublicationStatus(pub)}
                                    className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition-colors"
                                    title={(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? "Masquer" : "Afficher"}
                                >
                                    {(pub.pubType === 'menu_item' ? pub.is_available : pub.is_active) ? <XCircle size={18} /> : <CheckCircle size={18} />}
                                </button>
                                <button 
                                    onClick={() => deletePublication(pub)}
                                    className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Supprimer"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </td>
                        </tr>
                    ))}
                    {publications.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">Aucune publication trouvée</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex relative transition-colors duration-300">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 dark:bg-gray-950 text-white flex flex-col transition-transform duration-300 ease-in-out md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
            <div className="flex items-center space-x-3">
                <div className="bg-white p-1 rounded-lg shadow-sm shadow-brand-900/50">
                    <img src={APP_LOGO_URL} alt="DashMeals" className="h-8 w-auto object-contain" />
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tight text-white leading-none">DashMeals</h1>
                    <span className="text-[10px] text-brand-400 font-bold uppercase tracking-wider">Admin</span>
                </div>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-gray-400 hover:text-white">
              <X size={24} />
            </button>
        </div>
        <nav className="flex-1 p-4 space-y-2">
            <button onClick={() => handleNavigation('overview')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeView === 'overview' ? 'bg-brand-600 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Activity size={20} /> <span>Vue d'ensemble</span>
            </button>
            <button onClick={() => handleNavigation('users')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeView === 'users' ? 'bg-brand-600 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Users size={20} /> <span>Utilisateurs</span>
            </button>
            <button onClick={() => handleNavigation('restaurants')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeView === 'restaurants' ? 'bg-brand-600 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Store size={20} /> <span>Restaurants</span>
            </button>
            <button onClick={() => handleNavigation('publications')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeView === 'publications' ? 'bg-brand-600 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Database size={20} /> <span>Publications</span>
            </button>
            <button onClick={() => handleNavigation('verifications')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${activeView === 'verifications' ? 'bg-brand-600 text-white font-bold' : 'text-gray-400 hover:bg-gray-800'}`}>
                <Shield size={20} /> <span>Vérifications</span>
                {stats.pendingVerifications > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full ml-auto">{stats.pendingVerifications}</span>}
            </button>
        </nav>
        <div className="p-4 border-t border-gray-800">
            <div className="mb-4">
                <label className="text-[10px] text-gray-500 mb-1 block uppercase font-bold">Apparence</label>
                <div className="flex bg-gray-800 rounded-lg p-1">
                    <button 
                        onClick={() => setTheme && setTheme('light')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-bold flex items-center justify-center transition-colors ${theme === 'light' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Sun size={14} className="mr-1"/> Clair
                    </button>
                    <button 
                        onClick={() => setTheme && setTheme('dark')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-bold flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Moon size={14} className="mr-1"/> Sombre
                    </button>
                </div>
            </div>

            {font && setFont && (
                <div className="mb-4">
                    <label className="text-[10px] text-gray-500 mb-1 block uppercase font-bold">Police</label>
                    <select 
                        value={font} 
                        onChange={(e) => setFont(e.target.value as AppFont)}
                        className="w-full bg-gray-800 text-gray-300 text-xs p-2 rounded-lg border border-gray-700 outline-none focus:border-brand-500"
                    >
                        <option value="facebook">Facebook (Défaut)</option>
                        <option value="inter">Inter</option>
                        <option value="roboto">Roboto</option>
                        <option value="opensans">Open Sans</option>
                        <option value="lato">Lato</option>
                        <option value="montserrat">Montserrat</option>
                        <option value="poppins">Poppins</option>
                        <option value="quicksand">Quicksand</option>
                        <option value="playfair">Playfair Display</option>
                    </select>
                </div>
            )}
            <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 text-red-400 hover:bg-red-900/20 p-2 rounded-lg transition-colors font-medium text-sm">
                <LogOut size={16} /> <span>Déconnexion</span>
            </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8 transition-all duration-300">
         <div className="md:hidden mb-6 flex items-center justify-between">
            <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              <Menu size={24} />
            </button>
            <span className="font-bold text-lg text-gray-900 dark:text-white">DashMeals Admin</span>
            <div className="w-10"></div>
         </div>

         <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4">
             <div>
                 <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                     {activeView === 'overview' && 'Tableau de bord'}
                     {activeView === 'users' && 'Utilisateurs'}
                     {activeView === 'restaurants' && 'Restaurants Partenaires'}
                     {activeView === 'publications' && 'Publications'}
                     {activeView === 'verifications' && 'Vérifications'}
                 </h2>
                 <p className="text-gray-500 dark:text-gray-400 text-sm">Bienvenue, {user.name}</p>
             </div>
             <div className="flex items-center space-x-4">
                 <div className="flex items-center px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-bold">
                     <CheckCircle size={14} className="mr-1" /> Système Opérationnel
                 </div>
             </div>
         </header>

         {activeView === 'overview' && renderOverview()}
         {activeView === 'users' && renderUsers()}
         {activeView === 'restaurants' && renderRestaurants()}
         {activeView === 'publications' && renderPublications()}
         {activeView === 'verifications' && renderVerifications()}
      </main>
    </div>
  );
};