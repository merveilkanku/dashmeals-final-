import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { APP_LOGO_URL } from './constants';
import { Restaurant, MenuItem, User, Order, OrderStatus, Promotion, Theme, Language, AppFont } from './types';
import { 
  Plus, Trash2, Power, LogOut, Coffee, DollarSign, Clock, Truck, 
  Receipt, CheckCircle, CheckCircle2, ChefHat, Bike, LayoutDashboard, Settings, 
  TrendingUp, Users, ShoppingBag, X, Save, Image as ImageIcon, MapPin,
  MessageSquare, Phone, Megaphone, Video, PlayCircle, Upload, AlertCircle, AlertTriangle, Bell, Moon, Sun, Globe, RefreshCw, Type, Shield,
  Lock, Eye, EyeOff, Smartphone, UserX, ToggleLeft, ToggleRight, Zap, User as UserIcon, Package, ChevronRight, Edit3, Star, Heart, UserPlus, Award, ShoppingCart, Gift, Fingerprint
} from 'lucide-react';
import { ChatWindow } from './components/ChatWindow';
import { useTranslation } from './lib/i18n';
import { requestNotificationPermission, sendPushNotification } from './utils/notifications';
import { PinSetupDialog } from './components/PinSetupDialog';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';

interface Props {
  user: User;
  restaurant: Restaurant;
  onUpdateRestaurant: (updated: Restaurant) => void;
  onUpdateUser: (updated: User) => void;
  onLogout: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  font?: AppFont;
  setFont?: (f: AppFont) => void;
}

type DashboardView = 'overview' | 'orders' | 'menu' | 'sales' | 'settings' | 'marketing' | 'marketplace' | 'subscribers' | 'team';

export const BusinessDashboard: React.FC<Props> = ({ user, restaurant, onUpdateRestaurant, onUpdateUser, onLogout, theme, setTheme, language, setLanguage, font, setFont }) => {
  const t = useTranslation(language);

  // RBAC Helper Functions
  const canAccessView = (view: DashboardView): boolean => {
      // Owner (business role) sees everything
      if (user.role === 'business') return true;
      
      // Staff roles
      if (user.role === 'staff') {
          if (user.staffRole === 'cook') {
              return ['orders', 'menu'].includes(view);
          }
          if (user.staffRole === 'admin' || user.staffRole === 'manager') {
              // Admin/Manager sees 80% (everything except team management)
              return view !== 'team';
          }
      }
      
      // Default fallback (should not happen for valid business/staff users)
      return ['overview', 'orders', 'menu'].includes(view);
  };

  const getDefaultView = (): DashboardView => {
      if (user.role === 'business') return 'overview';
      if (user.role === 'staff') {
          if (user.staffRole === 'cook') return 'orders';
          return 'overview';
      }
      return 'overview';
  };

  const [activeView, setActiveView] = useState<DashboardView>(getDefaultView());
  const [settingsSubView, setSettingsSubView] = useState<'menu' | 'verification' | 'content' | 'privacy'>('menu');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);

  const [isPinSetupOpen, setIsPinSetupOpen] = useState(false);

  // History Management
  useEffect(() => {
      const defaultView = getDefaultView();
      const currentHash = window.location.hash.replace('#', '') as DashboardView;
      
      if (!window.history.state) {
          const initialView = (currentHash && canAccessView(currentHash)) ? currentHash : defaultView;
          window.history.replaceState({ view: initialView }, '', `#${initialView}`);
          setActiveView(initialView);
      } else if (window.history.state.view && !canAccessView(window.history.state.view)) {
          window.history.replaceState({ view: defaultView }, '', `#${defaultView}`);
          setActiveView(defaultView);
      }

      const onPopState = (e: PopStateEvent) => {
          const state = e.state;
          if (state?.view) {
              if (canAccessView(state.view)) {
                  setActiveView(state.view);
              } else {
                  // Redirect to default view if unauthorized
                  const defaultView = getDefaultView();
                  window.history.replaceState({ view: defaultView }, '', `#${defaultView}`);
                  setActiveView(defaultView);
              }
          }
          if (!state?.chat) setActiveChatOrder(null);
          setIsSidebarOpen(!!state?.sidebar);
      };

      window.addEventListener('popstate', onPopState);
      return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (view: DashboardView) => {
      if (view === activeView) return;
      if (!canAccessView(view)) {
          toast.error("Vous n'avez pas la permission d'accéder à cette section.");
          return;
      }
      window.history.pushState({ view }, '', `#${view}`);
      setActiveView(view);
      setIsSidebarOpen(false);
  };

  const openChat = (order: Order) => {
      window.history.pushState({ view: activeView, chat: true }, '', '#chat');
      setActiveChatOrder(order);
  };

  const closeChat = () => {
      if (window.history.state?.chat) window.history.back();
      else setActiveChatOrder(null);
  };

  const toggleSidebar = () => {
      if (!isSidebarOpen) {
          window.history.pushState({ view: activeView, sidebar: true }, '', '#menu');
          setIsSidebarOpen(true);
      } else {
          if (window.history.state?.sidebar) window.history.back();
          else setIsSidebarOpen(false);
      }
  };

  const closeSidebar = () => {
      if (window.history.state?.sidebar) window.history.back();
      else setIsSidebarOpen(false);
  };

  // Menu Management State
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [updatingTimes, setUpdatingTimes] = useState(false);

  const formatPrice = (price: number) => {
      if (restaurant.currency === 'CDF') {
          return `${price.toFixed(0)} FC`;
      }
      return `$${price.toFixed(2)}`;
  };
  
  // Marketing State
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [newPromoUrl, setNewPromoUrl] = useState('');
  const [newPromoType, setNewPromoType] = useState<'image' | 'video'>('image');
  const [newPromoCaption, setNewPromoCaption] = useState('');
  const [isAddingPromo, setIsAddingPromo] = useState(false);
  const [promoFile, setPromoFile] = useState<File | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  // Automated Campaigns State
  const [isAddingCampaign, setIsAddingCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any | null>(null);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignTrigger, setNewCampaignTrigger] = useState<'abandoned_cart' | 'dormant_30_days' | 'birthday' | 'new_customer' | 'loyal_customer'>('abandoned_cart');
  const [newCampaignMessage, setNewCampaignMessage] = useState('');
  const [newCampaignDiscount, setNewCampaignDiscount] = useState(10);
  const [isSavingCampaign, setIsSavingCampaign] = useState(false);
  
  // Settings State
  const [settingsForm, setSettingsForm] = useState({
      name: restaurant.name || '',
      description: restaurant.description || '',
      coverImage: restaurant.coverImage || '',
      city: restaurant.city || '',
      latitude: restaurant.latitude || 0,
      longitude: restaurant.longitude || 0,
      phoneNumber: restaurant.phoneNumber || '',
      currency: restaurant.currency || 'USD',
      paymentConfig: restaurant.paymentConfig || {
          acceptCash: true,
          acceptMobileMoney: false
      }
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

  // Verification State
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [registryNumber, setRegistryNumber] = useState(restaurant.verificationDocs?.registryNumber || '');
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);
  const [otherProducts, setOtherProducts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'admin' | 'manager' | 'cook'>('cook');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [isSavingStaff, setIsSavingStaff] = useState(false);
  const [automatedCampaigns, setAutomatedCampaigns] = useState<any[]>([]);
  const [selectedMarketProduct, setSelectedMarketProduct] = useState<any | null>(null);

  useEffect(() => {
    if (activeView === 'marketplace') {
        fetchOtherProducts();
    }
    if (activeView === 'subscribers' && restaurant?.id) {
        fetchFollowers();
        
        // Subscribe to real-time updates for followers
        const channel = supabase
            .channel(`followers_${restaurant.id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'followers',
                    filter: `restaurant_id=eq.${restaurant.id}`
                },
                () => {
                    console.log("Real-time update for followers detected");
                    fetchFollowers();
                }
            )
            .subscribe();
            
        return () => {
            supabase.removeChannel(channel);
        };
    }
    if (activeView === 'team') {
        fetchStaff();
    }
    if (activeView === 'marketing') {
        fetchCampaigns();
    }
  }, [activeView, restaurant?.id]);

  const fetchStaff = async () => {
    try {
        const { data, error } = await supabase
            .from('staff_members')
            .select('*')
            .eq('restaurant_id', restaurant.id);
        if (error) throw error;
        setStaffMembers(data || []);
    } catch (err) {
        console.error("Error fetching staff:", err);
    }
  };

  const handleSaveStaff = async () => {
    if (!newStaffName.trim()) {
        toast.error("Le nom du membre est requis.");
        return;
    }
    
    setIsSavingStaff(true);
    try {
        const payload = {
            restaurant_id: restaurant.id,
            name: newStaffName,
            role: newStaffRole,
            pin_code: newStaffPin || null
        };

        if (editingStaff) {
            const { error } = await supabase
                .from('staff_members')
                .update(payload)
                .eq('id', editingStaff.id);
            
            if (error) throw error;
            
            setStaffMembers(staffMembers.map(s => s.id === editingStaff.id ? { ...s, ...payload } : s));
            toast.success("Membre modifié avec succès.");
        } else {
            const { data, error } = await supabase
                .from('staff_members')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            setStaffMembers([...staffMembers, data]);
            toast.success("Membre ajouté avec succès.");
        }
        
        setIsAddingStaff(false);
        setEditingStaff(null);
        setNewStaffName('');
        setNewStaffRole('cook');
        setNewStaffPin('');
    } catch (err) {
        console.error("Error saving staff:", err);
        toast.error("Erreur lors de l'enregistrement du membre.");
    } finally {
        setIsSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
      try {
          const { error } = await supabase
              .from('staff_members')
              .delete()
              .eq('id', staffId);
          if (error) throw error;
          setStaffMembers(staffMembers.filter(s => s.id !== staffId));
          toast.success("Membre supprimé.");
      } catch (err) {
          console.error("Error deleting staff:", err);
          toast.error("Erreur lors de la suppression.");
      }
  };

  const fetchCampaigns = async () => {
    try {
        const { data, error } = await supabase
            .from('automated_campaigns')
            .select('*')
            .eq('restaurant_id', restaurant.id);
        if (error) throw error;
        setAutomatedCampaigns(data || []);
    } catch (err) {
        console.error("Error fetching campaigns:", err);
    }
  };

  const handleSaveCampaign = async () => {
      if (!newCampaignName.trim() || !newCampaignMessage.trim()) {
          toast.error("Veuillez remplir tous les champs.");
          return;
      }

      setIsSavingCampaign(true);
      try {
          const payload = {
              restaurant_id: restaurant.id,
              name: newCampaignName,
              trigger_type: newCampaignTrigger,
              message_body: newCampaignMessage,
              discount_percentage: newCampaignDiscount,
              is_active: editingCampaign ? editingCampaign.is_active : true
          };

          if (editingCampaign) {
              const { error } = await supabase
                  .from('automated_campaigns')
                  .update(payload)
                  .eq('id', editingCampaign.id);
              
              if (error) throw error;
              
              setAutomatedCampaigns(automatedCampaigns.map(c => c.id === editingCampaign.id ? { ...c, ...payload } : c));
              toast.success("Campagne modifiée avec succès.");
          } else {
              const { data, error } = await supabase
                  .from('automated_campaigns')
                  .insert(payload)
                  .select()
                  .single();

              if (error) throw error;

              setAutomatedCampaigns([...automatedCampaigns, data]);
              toast.success("Campagne créée avec succès.");
          }

          setIsAddingCampaign(false);
          setEditingCampaign(null);
          setNewCampaignName('');
          setNewCampaignMessage('');
          setNewCampaignDiscount(10);
      } catch (err) {
          console.error("Error saving campaign:", err);
          toast.error("Erreur lors de l'enregistrement de la campagne.");
      } finally {
          setIsSavingCampaign(false);
      }
  };

  const handleToggleCampaign = async (campaignId: string, currentStatus: boolean) => {
      try {
          const { error } = await supabase
              .from('automated_campaigns')
              .update({ is_active: !currentStatus })
              .eq('id', campaignId);
          
          if (error) throw error;

          setAutomatedCampaigns(automatedCampaigns.map(c => 
              c.id === campaignId ? { ...c, is_active: !currentStatus } : c
          ));
          toast.success(`Campagne ${!currentStatus ? 'activée' : 'désactivée'}.`);
      } catch (err) {
          console.error("Error toggling campaign:", err);
          toast.error("Erreur lors de la modification du statut.");
      }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
      try {
          const { error } = await supabase
              .from('automated_campaigns')
              .delete()
              .eq('id', campaignId);
          if (error) throw error;
          setAutomatedCampaigns(automatedCampaigns.filter(c => c.id !== campaignId));
          toast.success("Campagne supprimée.");
      } catch (err) {
          console.error("Error deleting campaign:", err);
          toast.error("Erreur lors de la suppression.");
      }
  };

  // CORRECTION: Fonction fetchOtherProducts améliorée
  const fetchOtherProducts = async () => {
    try {
        console.log("🔍 Chargement des produits marketplace...");
        
        // Récupérer les produits des autres restaurants
        const { data: products, error: productsError } = await supabase
            .from('menu_items')
            .select('*')
            .neq('restaurant_id', restaurant.id)
            .limit(20);

        if (productsError) {
            console.error("Erreur produits:", productsError);
            toast.error("Erreur lors du chargement des produits");
            setOtherProducts([]);
            return;
        }
        
        if (!products || products.length === 0) {
            console.log("Aucun produit trouvé");
            setOtherProducts([]);
            return;
        }
        
        // Récupérer les restaurants associés
        const restaurantIds = [...new Set(products.map(p => p.restaurant_id))];
        
        const { data: restaurantsData, error: restaurantsError } = await supabase
            .from('restaurants')
            .select('id, name, city, cover_image, is_open')
            .in('id', restaurantIds);
            
        if (restaurantsError) {
            console.error("Erreur restaurants:", restaurantsError);
            setOtherProducts(products.map(p => ({ ...p, restaurants: null })));
            return;
        }
        
        // Fusionner les données
        const restaurantsMap = new Map();
        restaurantsData?.forEach(r => restaurantsMap.set(r.id, r));
        
        const enrichedProducts = products.map(p => ({
            ...p,
            restaurants: restaurantsMap.get(p.restaurant_id) || null
        }));
        
        console.log(`✅ ${enrichedProducts.length} produits trouvés`);
        setOtherProducts(enrichedProducts);
        
    } catch (err) {
        console.error("Erreur fetchOtherProducts:", err);
        setOtherProducts([]);
    }
  };

  const fetchFollowers = async () => {
    try {
        if (!restaurant?.id) return;
        
        console.log("Fetching followers for restaurant:", restaurant.id);
        // Tenter d'abord avec la jointure (nécessite une clé étrangère correcte)
        const { data, error } = await supabase
            .from('followers')
            .select('*, profiles(*)')
            .eq('restaurant_id', restaurant.id);
            
        if (error) {
            console.warn("La jointure a échoué, passage au mode manuel:", error);
            // Mode manuel : récupérer les abonnés puis leurs profils
            const { data: followersData, error: followersError } = await supabase
                .from('followers')
                .select('*')
                .eq('restaurant_id', restaurant.id);
            
            if (followersError) throw followersError;
            
            if (followersData && followersData.length > 0) {
                const userIds = followersData.map(f => f.user_id);
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', userIds);
                
                if (profilesError) {
                    console.error("Erreur lors de la récupération manuelle des profils:", profilesError);
                    setFollowers(followersData);
                } else {
                    const profilesMap = new Map();
                    profilesData?.forEach(p => profilesMap.set(p.id, p));
                    const enrichedFollowers = followersData.map(f => ({
                        ...f,
                        profiles: profilesMap.get(f.user_id) || null
                    }));
                    setFollowers(enrichedFollowers);
                }
            } else {
                setFollowers([]);
            }
            return;
        }
        
        console.log("Followers data fetched:", data);
        setFollowers(data || []);
    } catch (err) {
        console.error("Error fetching followers:", err);
    }
  };

  const submitVerificationStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!idCardFile && !restaurant.verificationDocs?.idCardUrl) {
        toast.error("Veuillez télécharger une photo de votre carte d'identité.");
        return;
    }
    if (!registryNumber) {
        toast.error("Veuillez entrer votre numéro de registre de commerce.");
        return;
    }

    setIsSubmittingVerification(true);
    try {
        let idCardUrl = restaurant.verificationDocs?.idCardUrl || '';
        
        if (idCardFile) {
            toast.info("Téléchargement de la carte d'identité en cours...");
            const uploaded = await uploadImage(idCardFile, 'images');
            
            if (uploaded) {
                idCardUrl = uploaded;
                toast.success("Carte d'identité téléchargée avec succès !");
            } else {
                throw new Error("Échec du téléchargement de la carte d'identité");
            }
        }

        const payload = {
            verification_status: 'pending',
            verification_docs: {
                idCardUrl,
                registryNumber
            }
        };

        const { error } = await supabase.from('restaurants').update(payload).eq('id', restaurant.id);
        
        if (error) {
            console.error("Supabase update error:", error);
            throw new Error(`Erreur base de données: ${error.message}`);
        }

        onUpdateRestaurant({ 
            ...restaurant, 
            verificationStatus: 'pending',
            verificationDocs: { idCardUrl, registryNumber }
        });
        
        toast.success("Documents envoyés ! Un administrateur les examinera sous 24-48h.");
        
    } catch (err: any) {
        console.error("Verification Error:", err);
        toast.error(`Erreur: ${err.message || "Erreur lors de l'envoi des documents"}`);
    } finally {
        setIsSubmittingVerification(false);
    }
  };

  const uploadVerificationDocument = async (file: File, type: 'id_card' | 'business_license'): Promise<string | null> => {
    try {
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Fichier trop volumineux. Maximum 5MB.");
            return null;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            toast.error("Format non supporté. Utilisez JPG, PNG ou PDF.");
            return null;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `verification/${restaurant.id}_${type}_${Date.now()}.${fileExt}`;
        
        console.log(`📤 Upload document vérification: ${fileName}`);

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error("Upload error:", uploadError);
            toast.error(`Erreur upload: ${uploadError.message}`);
            return null;
        }

        const { data: publicUrlData } = supabase.storage.from('images').getPublicUrl(fileName);
        console.log(`✅ Document uploadé: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;
        
    } catch (error) {
        console.error("Upload exception:", error);
        toast.error("Erreur lors de l'upload");
        return null;
    }
  };

  const confirmVerificationPayment = async () => {
      if (!confirm("Avez-vous bien envoyé 5$ au numéro Airtel Money indiqué ?")) return;
      
      setIsSubmittingVerification(true);
      try {
          const { error } = await supabase.from('restaurants')
            .update({ verification_payment_status: 'paid' })
            .eq('id', restaurant.id);
            
          if (error) throw error;

          onUpdateRestaurant({ ...restaurant, verificationPaymentStatus: 'paid' });
          toast.success("Paiement signalé ! Un administrateur vérifiera votre compte sous peu.");
      } catch (err) {
          console.error("Payment Error:", err);
          onUpdateRestaurant({ ...restaurant, verificationPaymentStatus: 'paid' });
          toast.info("Paiement signalé (Mode Démo) !");
      } finally {
          setIsSubmittingVerification(false);
      }
  };

  const [prepTime, setPrepTime] = useState(restaurant.preparationTime?.toString() || '');
  const [deliveryTime, setDeliveryTime] = useState(restaurant.estimatedDeliveryTime?.toString() || '');

  const [newItemName, setNewItemName] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('');
  const [newItemLowStockThreshold, setNewItemLowStockThreshold] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<MenuItem['category']>('plat');
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [orderFilter, setOrderFilter] = useState<'all' | 'active' | 'completed'>('active');

  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;

  const filteredOrders = orders.filter(order => {
      if (orderFilter === 'all') return true;
      if (orderFilter === 'active') return ['pending', 'preparing', 'ready', 'delivering'].includes(order.status);
      if (orderFilter === 'completed') return ['completed', 'cancelled'].includes(order.status);
      return true;
  });

  const refreshOrders = async () => {
      setIsRefreshing(true);
      await fetchRestaurantOrders();
      setIsRefreshing(false);
  };

  const pickImage = async (source: CameraSource = CameraSource.Prompt): Promise<File | null> => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: source
      });

      if (image.webPath) {
        const response = await fetch(image.webPath);
        const blob = await response.blob();
        return new File([blob], `photo_${Date.now()}.${image.format}`, { type: blob.type });
      }
      return null;
    } catch (err) {
      console.error("Camera error:", err);
      return null;
    }
  };

  const uploadImage = async (file: File, bucket: string = 'images'): Promise<string | null> => {
    try {
        let maxSize = 50 * 1024 * 1024;
        let allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];
        
        if (file.type === 'application/pdf') {
            maxSize = 10 * 1024 * 1024;
            allowedTypes = ['application/pdf'];
        }
        
        if (file.size > maxSize) {
            toast.error(`Fichier trop volumineux. Maximum ${maxSize / (1024 * 1024)}MB.`);
            return null;
        }

        if (!allowedTypes.includes(file.type) && !(file.type.startsWith('image/'))) {
            toast.error(`Type de fichier non supporté. Types acceptés: images et PDF`);
            return null;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
        const filePath = file.type === 'application/pdf' 
            ? `verification_documents/${fileName}`
            : `restaurant_uploads/${fileName}`;

        console.log(`📤 Upload vers bucket '${bucket}': ${filePath}`);

        const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

        if (uploadError) {
            console.error("Upload error details:", uploadError);
            
            if (uploadError.message.includes("row-level security policy") || uploadError.message.includes("permission denied")) {
                toast.error("❌ Erreur de permission. Vérifiez que vous êtes connecté et que les politiques RLS sont configurées.");
            } else if (uploadError.message.includes("bucket not found")) {
                toast.error(`❌ Bucket '${bucket}' introuvable.`);
            } else {
                toast.error(`Erreur upload: ${uploadError.message}`);
            }
            return null;
        }

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        
        console.log(`✅ Upload réussi: ${publicUrlData.publicUrl}`);
        return publicUrlData.publicUrl;
        
    } catch (error) {
        console.error("Upload exception:", error);
        toast.error("Erreur lors de l'upload. Vérifiez votre connexion internet.");
        return null;
    }
  };

  useEffect(() => {
    requestNotificationPermission();

    fetchRestaurantOrders();
    fetchPromotions();
    
    const channel = supabase
      .channel('orders-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          console.log("Mise à jour commande reçue:", payload);
          fetchRestaurantOrders();
          
          if (payload.eventType === 'INSERT') {
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
             audio.play().catch(e => console.log("Audio play failed", e));
             setShowNotification(true);
             setTimeout(() => setShowNotification(false), 8000);
             
             sendPushNotification("Nouvelle Commande !", {
                 body: "Un client vient de passer une commande.",
                 tag: "new-order",
                 requireInteraction: true
             });
          }
        }
      )
      .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [restaurant.id]);

  useEffect(() => {
      setSettingsForm({
          name: restaurant.name,
          description: restaurant.description,
          coverImage: restaurant.coverImage,
          city: restaurant.city,
          phoneNumber: restaurant.phoneNumber || '',
          currency: restaurant.currency || 'USD',
          paymentConfig: restaurant.paymentConfig || {
              acceptCash: true,
              acceptMobileMoney: false
          }
      });
  }, [restaurant]);

  const fetchPromotions = async () => {
    try {
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .order('created_at', { ascending: false });
      
      if (data) {
        setPromotions(data.map((p: any) => ({
          id: p.id,
          restaurantId: p.restaurant_id,
          mediaUrl: p.media_url,
          mediaType: p.media_type,
          caption: p.caption,
          createdAt: p.created_at
        })));
      }
    } catch (err) {
      console.warn("Promotions fetch error", err);
    }
  };

  const fetchRestaurantOrders = async () => {
    try {
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('restaurant_id', restaurant.id)
            .order('created_at', { ascending: false });

        if (ordersError) {
             console.warn("Fetch orders failed:", ordersError.message);
             const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
             if (localOrdersStr) {
                 const localOrders = JSON.parse(localOrdersStr);
                 const restaurantLocalOrders = localOrders.filter((o: any) => o.restaurant_id === restaurant.id);
                 if (restaurantLocalOrders.length > 0) {
                     setOrders(restaurantLocalOrders.map((o: any) => ({
                         id: o.id,
                         userId: o.user_id,
                         restaurantId: o.restaurant_id,
                         status: o.status,
                         totalAmount: o.total_amount,
                         isUrgent: o.items && o.items.length > 0 ? o.items[0].isUrgent : false,
                         paymentMethod: o.items && o.items.length > 0 ? o.items[0].paymentMethod : 'cash',
                         paymentNetwork: o.items && o.items.length > 0 ? o.items[0].paymentNetwork : undefined,
                         paymentStatus: o.items && o.items.length > 0 ? o.items[0].paymentStatus : 'pending',
                         paymentProof: o.items && o.items.length > 0 ? o.items[0].paymentProof : undefined,
                         deliveryLocation: o.items && o.items.length > 0 ? o.items[0].deliveryLocation : undefined,
                         items: o.items,
                         createdAt: o.created_at,
                         customer: { 
                             full_name: (o.items && o.items.length > 0 ? o.items[0].customerName : null) || 'Client Local', 
                             phone_number: (o.items && o.items.length > 0 ? o.items[0].customerPhone : null) || '' 
                         }
                     })));
                 }
             }
             return;
        }
        
        let allOrders = ordersData || [];
        
        const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
        if (localOrdersStr) {
            try {
                const localOrders = JSON.parse(localOrdersStr);
                const restaurantLocalOrders = localOrders.filter((o: any) => o.restaurant_id === restaurant.id);
                allOrders = [...restaurantLocalOrders, ...allOrders];
            } catch (e) {
                console.error("Error parsing local orders", e);
            }
        }

        if (allOrders.length >= 0) {
            const userIds = Array.from(new Set(allOrders.map((o: any) => o.user_id))).filter(Boolean);
            const validUserIds = userIds.filter((id: any) => typeof id === 'string' && id.length === 36);
            
            let profilesMap: Record<string, any> = {};
            if (validUserIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', validUserIds);
                
                if (profilesData) {
                    profilesData.forEach((p: any) => {
                        profilesMap[p.id] = p;
                    });
                }
            }

            const formattedOrders = allOrders.map((o: any) => {
                let parsedItems = o.items;
                if (typeof o.items === 'string') {
                    try { parsedItems = JSON.parse(o.items); } catch (e) { parsedItems = []; }
                }
                
                const fallbackName = (parsedItems && parsedItems.length > 0) ? parsedItems[0].customerName : null;
                const fallbackPhone = (parsedItems && parsedItems.length > 0) ? parsedItems[0].customerPhone : null;
                
                return {
                    id: o.id,
                    userId: o.user_id,
                    restaurantId: o.restaurant_id,
                    status: o.status,
                    totalAmount: o.total_amount,
                    isUrgent: parsedItems && parsedItems.length > 0 ? parsedItems[0].isUrgent : false,
                    paymentMethod: parsedItems && parsedItems.length > 0 ? parsedItems[0].paymentMethod : 'cash',
                    paymentNetwork: parsedItems && parsedItems.length > 0 ? parsedItems[0].paymentNetwork : undefined,
                    paymentStatus: parsedItems && parsedItems.length > 0 ? parsedItems[0].paymentStatus : 'pending',
                    paymentProof: parsedItems && parsedItems.length > 0 ? parsedItems[0].paymentProof : undefined,
                    deliveryLocation: parsedItems && parsedItems.length > 0 ? parsedItems[0].deliveryLocation : undefined,
                    items: parsedItems,
                    createdAt: o.created_at,
                    customer: { 
                        full_name: profilesMap[o.user_id]?.full_name || fallbackName || 'Client Inconnu',
                        phone_number: profilesMap[o.user_id]?.phone_number || fallbackPhone || ''
                    }
                };
            });
            
            formattedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setOrders(formattedOrders);
        }
    } catch (err) {
        console.error("Error fetching restaurant orders:", err);
    }
  };

  const updateOrderItemQuantity = async (orderId: string, itemIndex: number, newQuantity: number) => {
    try {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        const newItems = [...order.items];
        if (newQuantity <= 0) {
            if (newItems.length === 1) {
                toast.error("Impossible de supprimer le dernier article. Utilisez le bouton 'Refuser' pour annuler la commande.");
                return;
            }
            newItems.splice(itemIndex, 1);
        } else {
            newItems[itemIndex] = { ...newItems[itemIndex], quantity: newQuantity };
        }

        const newTotalAmount = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        if (orderId.startsWith('mock-')) {
            const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
            if (localOrdersStr) {
                const localOrders = JSON.parse(localOrdersStr);
                const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { ...o, items: newItems, total_amount: newTotalAmount } : o);
                localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, totalAmount: newTotalAmount } : o));
            }
            return;
        }

        const { error } = await supabase
            .from('orders')
            .update({ items: newItems, total_amount: newTotalAmount })
            .eq('id', orderId);

        if (error) {
            toast.error("Erreur lors de la mise à jour de la commande");
        } else {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: newItems, totalAmount: newTotalAmount } : o));
            toast.success("Quantité mise à jour");
        }
    } catch (err) {
        console.error("Error updating order items:", err);
    }
  };

  const updatePaymentStatus = async (orderId: string, newStatus: 'pending' | 'paid' | 'failed') => {
    try {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        const newItems = order.items.map(item => ({ ...item, paymentStatus: newStatus }));

        if (orderId.startsWith('mock-')) {
            const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
            if (localOrdersStr) {
                const localOrders = JSON.parse(localOrdersStr);
                const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { ...o, items: newItems } : o);
                localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus: newStatus, items: newItems } : o));
            }
            return;
        }

        const { error } = await supabase
            .from('orders')
            .update({ items: newItems })
            .eq('id', orderId);

        if (error) {
            toast.error("Erreur lors de la mise à jour du paiement");
        } else {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus: newStatus, items: newItems } : o));
            if (newStatus === 'failed') {
                toast.success("Client notifié pour corriger la preuve de paiement");
            } else {
                toast.success("Statut de paiement mis à jour");
            }
        }
    } catch (err) {
        console.error("Error updating payment status:", err);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
        if (orderId.startsWith('mock-')) {
            const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
            if (localOrdersStr) {
                const localOrders = JSON.parse(localOrdersStr);
                const updatedOrders = localOrders.map((o: any) => o.id === orderId ? { ...o, status: newStatus } : o);
                localStorage.setItem('dashmeals_mock_orders', JSON.stringify(updatedOrders));
                setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            }
            return;
        }

        const { error } = await supabase
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);

        if (error) {
            toast.error("Erreur lors de la mise à jour du statut");
        } else {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            
            if (newStatus === 'completed') {
                const order = orders.find(o => o.id === orderId);
                if (order) {
                    const updatedMenu = [...restaurant.menu];
                    let stockUpdated = false;
                    
                    for (const item of order.items) {
                        const menuIndex = updatedMenu.findIndex(m => m.id === item.id);
                        if (menuIndex !== -1 && updatedMenu[menuIndex].stock !== undefined) {
                            updatedMenu[menuIndex] = {
                                ...updatedMenu[menuIndex],
                                stock: Math.max(0, updatedMenu[menuIndex].stock! - item.quantity)
                            };
                            stockUpdated = true;
                            
                            await supabase
                                .from('menu_items')
                                .update({ stock: updatedMenu[menuIndex].stock })
                                .eq('id', item.id);
                        }
                    }
                    
                    if (stockUpdated) {
                        onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
                    }
                }
            }
        }
    } catch (err) {
        console.error("Error updating status:", err);
    }
  };

  const addPromotion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPromoError(null);

    let urlToUse = newPromoUrl;

    if (promoFile) {
        const isVideo = promoFile.type.startsWith('video/');
        const isImage = promoFile.type.startsWith('image/');
        
        if (newPromoType === 'video' && !isVideo) {
            setPromoError("Le fichier sélectionné n'est pas une vidéo valide.");
            setLoading(false);
            return;
        }
        if (newPromoType === 'image' && !isImage) {
            setPromoError("Le fichier sélectionné n'est pas une image valide.");
            setLoading(false);
            return;
        }

        const maxSize = newPromoType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (promoFile.size > maxSize) {
            setPromoError(`Fichier trop volumineux. Maximum ${newPromoType === 'video' ? '50MB' : '10MB'}.`);
            setLoading(false);
            return;
        }

        const uploaded = await uploadImage(promoFile, 'images');
        if (uploaded) {
            urlToUse = uploaded;
        } else {
            setPromoError("Échec du téléchargement du média vers le serveur.");
            setLoading(false);
            return;
        }
    }

    if (!urlToUse) {
        setPromoError("Veuillez fournir une URL ou sélectionner un fichier média.");
        setLoading(false);
        return;
    }
    
    const payload = {
      restaurant_id: restaurant.id,
      media_url: urlToUse,
      media_type: newPromoType,
      caption: newPromoCaption
    };

    try {
      const { data, error } = await supabase.from('promotions').insert(payload).select().single();
      
      if (error) {
          console.error("Supabase insert error:", error);
          if (error.code === '42501') {
              throw new Error("Permission refusée (RLS). Vous n'avez pas le droit d'ajouter des promotions.");
          }
          throw new Error(error.message);
      }
      
      if (data) {
        const newPromo: Promotion = {
          id: data.id,
          restaurantId: restaurant.id,
          mediaUrl: data.media_url,
          mediaType: data.media_type,
          caption: data.caption,
          createdAt: data.created_at
        };
        setPromotions([newPromo, ...promotions]);
        setNewPromoUrl('');
        setNewPromoCaption('');
        setPromoFile(null);
        setIsAddingPromo(false);
        toast.success("Story publiée avec succès ! (Visible 24h)");
      }
    } catch (err: any) {
      console.error("Error adding promo:", err);
      setPromoError(`Erreur lors de la publication : ${err.message || "Vérifiez votre connexion internet"}`);
    } finally {
      setLoading(false);
    }
  };

  const deletePromotion = async (id: string) => {
    if (!confirm("Supprimer cette publicité ?")) return;
    try {
      await supabase.from('promotions').delete().eq('id', id);
      setPromotions(promotions.filter(p => p.id !== id));
    } catch (err) {
      setPromotions(promotions.filter(p => p.id !== id));
    }
  };

  const updateTimes = async () => {
    setUpdatingTimes(true);
    try {
      const newPrep = parseInt(prepTime) || 0;
      const newDeliv = parseInt(deliveryTime) || 0;

      const { error } = await supabase
        .from('restaurants')
        .update({ preparation_time: newPrep, estimated_delivery_time: newDeliv })
        .eq('id', restaurant.id);
      if (error) throw error;

      onUpdateRestaurant({ ...restaurant, preparationTime: newPrep, estimatedDeliveryTime: newDeliv });
      toast.success("Temps mis à jour !");
    } catch (err) {
        onUpdateRestaurant({ ...restaurant, preparationTime: parseInt(prepTime), estimatedDeliveryTime: parseInt(deliveryTime) });
    } finally { setUpdatingTimes(false); }
  };

  const toggleOpen = async () => {
    try {
      const newState = !restaurant.isOpen;
      const { error } = await supabase.from('restaurants').update({ is_open: newState }).eq('id', restaurant.id);
      if (error) throw error;
      onUpdateRestaurant({ ...restaurant, isOpen: newState });
    } catch (err) {
        onUpdateRestaurant({ ...restaurant, isOpen: !restaurant.isOpen });
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSavingSettings(true);
      
      let imageUrl = settingsForm.coverImage;

      if (coverImageFile) {
          const uploadedUrl = await uploadImage(coverImageFile, 'images');
          if (uploadedUrl) {
              imageUrl = uploadedUrl;
          } else {
              setIsSavingSettings(false);
              return;
          }
      }

      const updatePayload: any = {
          name: settingsForm.name,
          description: settingsForm.description,
          cover_image: imageUrl,
          city: settingsForm.city,
          latitude: settingsForm.latitude,
          longitude: settingsForm.longitude,
          phone_number: settingsForm.phoneNumber,
          currency: settingsForm.currency,
          payment_config: settingsForm.paymentConfig
      };

      try {
          const { error } = await supabase.from('restaurants')
            .update(updatePayload)
            .eq('id', restaurant.id);

          if(error) {
              if (error.code === '42703') {
                  console.warn("Missing columns in restaurants table, retrying without currency/payment_config/phone_number");
                  delete updatePayload.currency;
                  delete updatePayload.payment_config;
                  delete updatePayload.phone_number;
                  const { error: retryError } = await supabase.from('restaurants')
                      .update(updatePayload)
                      .eq('id', restaurant.id);
                  if (retryError) throw retryError;
              } else {
                  throw error;
              }
          }
          
          onUpdateRestaurant({ 
              ...restaurant, 
              name: settingsForm.name,
              description: settingsForm.description,
              city: settingsForm.city,
              latitude: settingsForm.latitude,
              longitude: settingsForm.longitude,
              phoneNumber: settingsForm.phoneNumber,
              coverImage: imageUrl 
          });
          
          setCoverImageFile(null);
          toast.success("✅ Paramètres enregistrés avec succès !");
      } catch (err: any) {
          console.error("Error Saving Settings:", err);
          toast.error(`Erreur de sauvegarde: ${err.message || 'Problème de connexion'}`);
          onUpdateRestaurant({ 
              ...restaurant, 
              name: settingsForm.name,
              description: settingsForm.description,
              city: settingsForm.city,
              latitude: settingsForm.latitude,
              longitude: settingsForm.longitude,
              phoneNumber: settingsForm.phoneNumber,
              coverImage: imageUrl 
          });
      } finally { 
          setIsSavingSettings(false); 
      }
  };

  const startEditItem = (item: MenuItem) => {
      setNewItemName(item.name || '');
      setNewItemDesc(item.description || '');
      setNewItemPrice(item.price?.toString() || '');
      setNewItemStock(item.stock?.toString() || '');
      setNewItemLowStockThreshold(item.lowStockThreshold?.toString() || '');
      setNewItemCategory(item.category);
      setEditingItem(item);
      setIsAddingItem(true);
  };

  const toggleItemAvailability = async (item: MenuItem) => {
      try {
          const newState = !item.isAvailable;
          const { error } = await supabase.from('menu_items').update({ is_available: newState }).eq('id', item.id);
          if (error) throw error;
          
          const updatedMenu = restaurant.menu.map(m => m.id === item.id ? { ...m, isAvailable: newState } : m);
          onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
      } catch (err) {
          console.error("Error toggling availability:", err);
          const updatedMenu = restaurant.menu.map(m => m.id === item.id ? { ...m, isAvailable: !item.isAvailable } : m);
          onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
      }
  };

  const deleteItem = async (itemId: string) => {
    if (!window.confirm("Supprimer cet élément ?")) return;
    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', itemId);
      if (error) throw error;
      onUpdateRestaurant({ ...restaurant, menu: restaurant.menu.filter(m => m.id !== itemId) });
    } catch (err) {
       onUpdateRestaurant({ ...restaurant, menu: restaurant.menu.filter(m => m.id !== itemId) });
    }
  };

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const price = parseFloat(newItemPrice);
    const stock = newItemStock ? parseInt(newItemStock) : undefined;
    const lowStockThreshold = newItemLowStockThreshold ? parseInt(newItemLowStockThreshold) : undefined;
    
    try {
        let imageUrl = editingItem ? editingItem.image : null;
        
        if (newItemImageFile) {
            const uploadedUrl = await uploadImage(newItemImageFile, 'images');
            if (uploadedUrl) {
                imageUrl = uploadedUrl;
            } else {
                setLoading(false);
                return;
            }
        }

        if (!imageUrl) {
            imageUrl = `https://picsum.photos/200/200?random=${Date.now()}`;
        }

        const payload = {
            name: newItemName,
            description: newItemDesc,
            price: price,
            stock: stock,
            low_stock_threshold: lowStockThreshold,
            category: newItemCategory,
            image: imageUrl,
            is_available: true
        };

        if (editingItem) {
            const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
            if (error) throw error;
            
            const updatedMenu = restaurant.menu.map(m => m.id === editingItem.id ? { ...m, ...payload, lowStockThreshold } : m);
            onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
            toast.success("Plat modifié avec succès !");
        } else {
            const newPayload = { ...payload, restaurant_id: restaurant.id };
            const { data, error } = await supabase.from('menu_items').insert(newPayload).select().single();
            if (error) throw error;
            
            if (data) {
                const newItem: MenuItem = {
                  id: data.id, name: data.name, description: data.description, price: data.price,
                  stock: data.stock,
                  lowStockThreshold: data.low_stock_threshold,
                  category: data.category as any, isAvailable: data.is_available, image: data.image
                };
                onUpdateRestaurant({ ...restaurant, menu: [...restaurant.menu, newItem] });
                toast.success("Plat ajouté avec succès !");
            }
        }
    } catch (err: any) {
      console.error("Error saving item:", err);
      toast.error(`Erreur: ${err.message || "Impossible d'enregistrer le plat"}`);
      if (editingItem) {
          const updatedMenu = restaurant.menu.map(m => m.id === editingItem.id ? { 
              ...m, name: newItemName, description: newItemDesc, price, stock, lowStockThreshold, category: newItemCategory 
          } : m);
          onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
      } else {
          const mockItem: MenuItem = {
              id: `mock-item-${Date.now()}`, name: newItemName, description: newItemDesc, price: price,
              stock: stock,
              lowStockThreshold: lowStockThreshold,
              category: newItemCategory, isAvailable: true, image: `https://picsum.photos/200/200?random=${Date.now()}`
          };
          onUpdateRestaurant({ ...restaurant, menu: [...restaurant.menu, mockItem] });
      }
    } finally {
      setNewItemName(''); setNewItemDesc(''); setNewItemPrice(''); setNewItemStock(''); setNewItemLowStockThreshold('');
      setIsAddingItem(false); setLoading(false);
      setNewItemImageFile(null);
      setEditingItem(null);
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
      switch(status) {
          case 'pending': return <span className="bg-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-bold uppercase">En attente</span>;
          case 'preparing': return <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-bold uppercase animate-pulse">En cuisine</span>;
          case 'ready': return <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">Prêt</span>;
          case 'delivering': return <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold uppercase">Livraison</span>;
          case 'completed': return <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold uppercase">Terminé</span>;
          case 'cancelled': return <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold uppercase">Annulé</span>;
      }
  };

  const completedOrders = orders.filter(o => o.status === 'completed');
  const revenue = completedOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const activeOrders = orders.filter(o => ['pending', 'preparing', 'ready', 'delivering'].includes(o.status));

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const dailyRevenue = completedOrders
    .filter(o => new Date(o.createdAt).toISOString().split('T')[0] === todayStr)
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const monthlyRevenue = completedOrders
    .filter(o => {
      const orderDate = new Date(o.createdAt);
      return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
    })
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const productSales: Record<string, { name: string, quantity: number, revenue: number }> = {};
  completedOrders.forEach(order => {
    order.items.forEach(item => {
      if (!productSales[item.id]) {
        productSales[item.id] = { name: item.name, quantity: 0, revenue: 0 };
      }
      productSales[item.id].quantity += item.quantity;
      productSales[item.id].revenue += item.price * item.quantity;
    });
  });
  const topSellingProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  const renderSidebarItem = (view: DashboardView, icon: React.ReactNode, label: string, badge?: number) => {
      if (!canAccessView(view)) return null;
      
      return (
        <button 
          onClick={() => navigateTo(view)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium group active:scale-95 ${activeView === view ? 'bg-brand-600 text-white font-bold shadow-lg shadow-brand-200 dark:shadow-brand-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 dark:hover:text-brand-400'}`}
        >
            <div className="flex items-center space-x-3">
                <div className={`transition-transform duration-300 ${activeView === view ? 'scale-110' : 'group-hover:scale-110'}`}>
                    {icon}
                </div>
                <span className="text-sm">{label}</span>
            </div>
            {badge && badge > 0 ? (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm ${activeView === view ? 'bg-white text-brand-600' : 'bg-brand-600 text-white animate-pulse'}`}>
                    {badge}
                </span>
            ) : null}
        </button>
      );
  };

  const renderOverview = () => {
      const isVerified = restaurant.isVerified;
      const createdAt = restaurant.createdAt ? new Date(restaurant.createdAt) : new Date();
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const isMandatory = createdAt < twoMonthsAgo;

      return (
      <div className="space-y-6 animate-in fade-in duration-500">
          {!isVerified && (
              <div className={`p-4 rounded-xl border flex items-start gap-4 ${isMandatory ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300' : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300'}`}>
                  <AlertTriangle size={24} className="flex-shrink-0 mt-1" />
                  <div>
                      <h4 className="font-bold text-lg mb-1">
                          {isMandatory ? 'Vérification Obligatoire Requise' : 'Faites vérifier votre entreprise'}
                      </h4>
                      <p className="text-sm mb-3">
                          {isMandatory 
                              ? 'Votre compte a plus de 2 mois. La vérification est maintenant obligatoire pour continuer à utiliser toutes les fonctionnalités du réseau.' 
                              : 'Obtenez un badge de vérification pour rassurer vos clients et débloquer la possibilité de publier des annonces visibles par tous sur le réseau.'}
                      </p>
                      <button 
                          onClick={() => toast.success("Votre demande de vérification a été envoyée. Notre équipe vous contactera sous 48h.")}
                          className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${isMandatory ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-500 hover:bg-yellow-600 text-white'}`}
                      >
                          Demander la vérification
                      </button>
                  </div>
              </div>
          )}
          {isVerified && (
              <div className="p-4 rounded-xl border bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300 flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-green-500" />
                  <div>
                      <h4 className="font-bold">Entreprise Vérifiée</h4>
                      <p className="text-sm">Votre compte est vérifié. Vous pouvez publier des annonces sur le réseau.</p>
                  </div>
              </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-bold text-gray-400">Chiffre d'affaires</p>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">${(revenue || 0).toFixed(2)}</h3>
                  </div>
                  <div className="w-12 h-12 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600 dark:text-green-400">
                      <DollarSign size={24} />
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-bold text-gray-400">En cours</p>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{activeOrders.length}</h3>
                  </div>
                  <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400">
                      <Clock size={24} />
                  </div>
              </div>
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-bold text-gray-400">Total Commandes</p>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-1">{orders.length}</h3>
                  </div>
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <ShoppingBag size={24} />
                  </div>
              </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex-1">
                  <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                      <Power size={18} className="mr-2 text-brand-600"/> Statut & Horaires
                  </h3>
                  <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                      <div>
                          <p className="font-bold text-gray-700 dark:text-gray-200">{restaurant.isOpen ? 'Ouvert aux clients' : 'Fermé actuellement'}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Changez le statut à tout moment.</p>
                      </div>
                      <button 
                        onClick={toggleOpen}
                        className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${restaurant.isOpen ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600'}`}
                      >
                          {restaurant.isOpen ? 'Fermer' : 'Ouvrir'}
                      </button>
                  </div>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">Temps de préparation (min)</label>
                          <input 
                              type="number" 
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                              value={prepTime}
                              onChange={e => setPrepTime(e.target.value)}
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1">Temps de livraison moyen (min)</label>
                          <input 
                              type="number" 
                              className="w-full p-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                              value={deliveryTime}
                              onChange={e => setDeliveryTime(e.target.value)}
                          />
                      </div>
                      <button 
                        onClick={updateTimes}
                        disabled={updatingTimes}
                        className="w-full bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-bold py-2 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/50"
                      >
                          {updatingTimes ? 'Mise à jour...' : 'Sauvegarder les temps'}
                      </button>
                  </div>
              </div>

              <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex-1">
                  <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                      <TrendingUp size={18} className="mr-2 text-brand-600"/> Activité Récente
                  </h3>
                  <div className="space-y-3">
                      {orders.slice(0, 5).map(order => (
                          <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors" onClick={() => navigateTo('orders')}>
                              <div>
                                  <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{order.customer?.full_name}</p>
                                  <p className="text-xs text-gray-400">{new Date(order.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">${(order.totalAmount || 0).toFixed(2)}</p>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                      {order.status}
                                  </span>
                              </div>
                          </div>
                      ))}
                      {orders.length === 0 && <p className="text-gray-400 text-center text-sm">Aucune activité récente.</p>}
                  </div>
                  <button onClick={() => navigateTo('orders')} className="w-full mt-4 text-brand-600 dark:text-brand-400 text-sm font-bold hover:underline">
                      Voir toutes les commandes
                  </button>
              </div>
          </div>
      </div>
  );
  };

  const renderMenu = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-gray-800 dark:text-white">Menu & Carte</h2>
        <button
          onClick={() => setIsAddingItem(!isAddingItem)}
          className="flex items-center bg-brand-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-brand-700 transition-colors shadow-lg"
        >
          <Plus size={18} className="mr-2" /> Ajouter un plat
        </button>
      </div>

      {isAddingItem && (
        <form onSubmit={addItem} className="bg-brand-50 dark:bg-brand-900/10 p-6 rounded-2xl border border-brand-100 dark:border-brand-900 shadow-sm animate-slide-in-down">
          <h4 className="font-bold text-brand-800 dark:text-brand-400 mb-4">{editingItem ? 'Modifier le Plat' : 'Nouveau Plat'}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Nom du plat</label>
              <input
                type="text"
                required
                className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                placeholder="Ex: Poulet Mayo"
                value={newItemName}
                onChange={e => setNewItemName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Prix ($)</label>
              <input
                type="number"
                step="0.1"
                required
                className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                placeholder="Ex: 15.0"
                value={newItemPrice}
                onChange={e => setNewItemPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Stock (Optionnel)</label>
              <input
                type="number"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                placeholder="Ex: 50"
                value={newItemStock}
                onChange={e => setNewItemStock(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Alerte Stock Bas (Optionnel)</label>
              <input
                type="number"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                placeholder="Ex: 10"
                value={newItemLowStockThreshold}
                onChange={e => setNewItemLowStockThreshold(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Description</label>
              <textarea
                className="w-full p-3 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg"
                placeholder="Description appétissante..."
                value={newItemDesc}
                onChange={e => setNewItemDesc(e.target.value)}
              />
            </div>
            
            <div className="md:col-span-2">
                 <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Photo du plat</label>
                 <div className="flex items-center space-x-2">
                    <button
                        type="button"
                        onClick={async () => {
                            const file = await pickImage();
                            if (file) setNewItemImageFile(file);
                        }}
                        className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-bold flex items-center"
                    >
                        <Upload size={16} className="mr-2"/>
                        {newItemImageFile ? 'Photo sélectionnée' : 'Prendre/Choisir une photo'}
                    </button>
                    {newItemImageFile && <span className="text-xs text-brand-600">{newItemImageFile.name}</span>}
                 </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Catégorie</label>
              <div className="flex space-x-2 overflow-x-auto pb-2">
                {(['entrée', 'plat', 'dessert', 'boisson'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewItemCategory(cat)}
                    className={`px-4 py-2 rounded-lg font-bold capitalize whitespace-nowrap ${newItemCategory === cat ? 'bg-brand-600 text-white' : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4 space-x-3">
            <button
              type="button"
              onClick={() => setIsAddingItem(false)}
              className="px-6 py-3 rounded-xl font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-xl font-bold bg-brand-600 text-white hover:bg-brand-700 shadow-lg"
            >
              {loading ? 'Sauvegarde...' : (editingItem ? 'Mettre à jour' : 'Ajouter au menu')}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {restaurant.menu.map(item => (
          <div key={item.id} className={`bg-white dark:bg-gray-800 p-4 rounded-xl border ${item.isAvailable ? 'border-gray-100 dark:border-gray-700' : 'border-red-200 bg-red-50 dark:bg-red-900/10'} shadow-sm flex space-x-4 hover:border-brand-200 transition-colors group relative`}>
            <img src={item.image} className={`w-24 h-24 rounded-lg object-cover bg-gray-100 dark:bg-gray-700 ${!item.isAvailable && 'grayscale opacity-50'}`} alt={item.name} />
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <h4 className="font-bold text-gray-800 dark:text-white text-lg">{item.name}</h4>
                <div className="flex space-x-1">
                    <button 
                        onClick={() => toggleItemAvailability(item)}
                        className={`p-1 rounded-md ${item.isAvailable ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'}`}
                        title={item.isAvailable ? "Marquer comme épuisé" : "Marquer comme disponible"}
                    >
                        {item.isAvailable ? <CheckCircle size={14} /> : <X size={14} />}
                    </button>
                    <span className="text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded capitalize">{item.category}</span>
                </div>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 mt-1">{item.description}</p>
              <div className="flex justify-between items-end mt-3">
                <div className="flex flex-col">
                  <span className="font-black text-brand-600 text-xl">{formatPrice(item.price)}</span>
                  {item.stock !== undefined && (
                    <span className={`text-xs font-bold px-2 py-1 rounded-full mt-1 w-fit ${item.stock > (item.lowStockThreshold || 5) ? 'bg-green-100 text-green-700' : item.stock > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      Stock: {item.stock} {item.lowStockThreshold ? `(Alerte: ${item.lowStockThreshold})` : ''}
                    </span>
                  )}
                </div>
                <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEditItem(item)}
                      className="p-2 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                    >
                      <Settings size={18} />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Advanced Settings State
  const [privacyProfile, setPrivacyProfile] = useState<'public' | 'private'>(restaurant.settings?.privacyProfile || 'public');
  const [privacyStories, setPrivacyStories] = useState<'everyone' | 'followers'>(restaurant.settings?.privacyStories || 'everyone');
  const [notifPush, setNotifPush] = useState(restaurant.settings?.notifPush ?? true);
  const [notifEmail, setNotifEmail] = useState(restaurant.settings?.notifEmail ?? true);
  const [notifSms, setNotifSms] = useState(restaurant.settings?.notifSms ?? false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(restaurant.settings?.twoFactorEnabled ?? false);
  const [appLockEnabled, setAppLockEnabled] = useState(restaurant.settings?.appLockEnabled ?? false);
  const [appLockPin, setAppLockPin] = useState(restaurant.settings?.appLockPin ?? null);
  const [biometricsEnabled, setBiometricsEnabled] = useState(restaurant.settings?.biometricsEnabled ?? false);

  const saveAdvancedSettings = async (updates: any) => {
      const newSettings = {
          privacyProfile,
          privacyStories,
          notifPush,
          notifEmail,
          notifSms,
          twoFactorEnabled,
          appLockEnabled,
          appLockPin,
          biometricsEnabled,
          ...updates
      };

      try {
          const { error } = await supabase
            .from('restaurants')
            .update({ settings: newSettings })
            .eq('id', restaurant.id);
          
          if (error) throw error;
      } catch (err) {
          console.error("Error saving advanced settings:", err);
      }
  };

  const renderVerification = () => (
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl">
        <h3 className="font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700 flex items-center">
            <Shield size={20} className="mr-2 text-brand-600"/> Vérification du Compte
        </h3>
        
        {restaurant.isVerified ? (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-200 dark:border-green-800 flex items-center text-green-700 dark:text-green-400">
                <CheckCircle size={24} className="mr-3"/>
                <div>
                    <p className="font-bold">Compte Vérifié</p>
                    <p className="text-sm">Votre établissement porte le badge de confiance.</p>
                </div>
            </div>
        ) : (
            <div className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-300 mb-2 font-bold">Pourquoi vérifier votre compte ?</p>
                    <ul className="list-disc list-inside text-xs text-blue-700 dark:text-blue-400 space-y-1">
                        <li>Badge orange "Vérifié" visible par les clients</li>
                        <li>Meilleur référencement dans les recherches</li>
                        <li>Confiance accrue des utilisateurs</li>
                    </ul>
                </div>

                <div className={`p-4 rounded-xl border ${restaurant.verificationStatus === 'pending' || restaurant.verificationStatus === 'verified' ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 opacity-50' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                    <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                        <span className="bg-brand-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">1</span>
                        Documents Légaux
                    </h4>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Numéro Registre Commerce (RCCM)</label>
                            <input 
                                type="text" 
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                placeholder="Ex: CD/KIN/RCCM/..."
                                value={registryNumber}
                                onChange={e => setRegistryNumber(e.target.value)}
                                disabled={restaurant.verificationStatus === 'pending'}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Photo Carte d'Identité / Passeport / PDF</label>
                            <input 
                                type="file" 
                                accept="image/*,application/pdf"
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                onChange={e => setIdCardFile(e.target.files?.[0] || null)}
                                disabled={restaurant.verificationStatus === 'pending'}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Formats acceptés : JPG, PNG, PDF (Max 10MB)</p>
                        </div>
                        {restaurant.verificationStatus !== 'pending' && (
                            <button 
                                onClick={submitVerificationStep1}
                                disabled={isSubmittingVerification}
                                className="w-full bg-gray-900 dark:bg-gray-700 text-white py-2 rounded-lg font-bold text-sm hover:bg-gray-800 dark:hover:bg-gray-600"
                            >
                                Envoyer les documents
                            </button>
                        )}
                    </div>
                </div>

                <div className={`p-4 rounded-xl border ${restaurant.verificationStatus !== 'pending' ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 opacity-50' : 'bg-white dark:bg-gray-800 border-brand-200 dark:border-brand-900 shadow-md'}`}>
                    <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                        <span className="bg-brand-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">2</span>
                        Paiement des frais (5$)
                    </h4>
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Veuillez envoyer <strong>5 USD</strong> par Airtel Money au numéro suivant pour couvrir les frais de dossier :
                        </p>
                        <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg text-center font-mono font-bold text-lg tracking-wider select-all text-gray-800 dark:text-white">
                            099 000 0000
                        </div>
                        {restaurant.verificationPaymentStatus === 'paid' ? (
                            <div className="text-green-600 dark:text-green-400 font-bold text-center text-sm flex items-center justify-center">
                                <CheckCircle size={16} className="mr-2"/> Paiement reçu, en attente de validation admin.
                            </div>
                        ) : (
                            <button 
                                onClick={confirmVerificationPayment}
                                disabled={restaurant.verificationStatus !== 'pending' || isSubmittingVerification}
                                className="w-full bg-brand-600 text-white py-2 rounded-lg font-bold text-sm hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                J'ai effectué le paiement
                            </button>
                        )}
                    </div>
                </div>
            </div>
        )}
      </div>
  );

  // CORRECTION: renderMarketplace avec gestion des erreurs
  const renderMarketplace = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Marketplace</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Découvrez ce que les autres vendeurs proposent.</p>
            </div>
            <div className="flex items-center bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
                <button className="px-4 py-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-lg text-xs font-bold">Tout</button>
                <button className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs font-bold hover:text-brand-600">Populaire</button>
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {otherProducts && otherProducts.length > 0 ? (
                otherProducts.map((item) => {
                    const restaurantData = item.restaurants;
                    const restaurantName = restaurantData?.name || 'Restaurant inconnu';
                    const restaurantCity = restaurantData?.city || 'Ville inconnue';
                    
                    return (
                        <div key={item.id} className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 group hover:shadow-xl transition-all duration-300">
                            <div className="relative h-48 overflow-hidden">
                                <img 
                                    src={item.image || 'https://picsum.photos/seed/food/400/300'} 
                                    alt={item.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/food/400/300';
                                    }}
                                />
                                <div className="absolute top-3 right-3 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-black text-brand-600 shadow-sm">
                                    {formatPrice(item.price)}
                                </div>
                                <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-white flex items-center">
                                    <MapPin size={10} className="mr-1" /> {restaurantCity}
                                </div>
                            </div>
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-1">
                                    <h4 className="font-bold text-gray-900 dark:text-white truncate flex-1">{item.name}</h4>
                                    <div className="flex items-center text-orange-500">
                                        <Star size={12} fill="currentColor" />
                                        <span className="text-[10px] font-bold ml-1">4.5</span>
                                    </div>
                                </div>
                                <p className="text-xs text-brand-600 font-bold mb-2 flex items-center truncate">
                                    <ChefHat size={12} className="mr-1 flex-shrink-0" /> 
                                    <span className="truncate">{restaurantName}</span>
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4 h-8">
                                    {item.description || 'Aucune description'}
                                </p>
                                <button 
                                    onClick={() => setSelectedMarketProduct(item)}
                                    className="w-full py-2 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl text-xs font-bold hover:bg-brand-600 hover:text-white transition-colors flex items-center justify-center"
                                >
                                    <ShoppingBag size={14} className="mr-2" /> Détails
                                </button>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="col-span-full py-20 text-center">
                    <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                        <Package size={32} />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-bold">Aucun article trouvé pour le moment.</p>
                    <p className="text-xs text-gray-400 mt-1">D'autres restaurants n'ont pas encore publié de produits.</p>
                </div>
            )}
        </div>
    </div>
  );

  const renderSubscribers = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center">
                    <Users className="mr-3 text-brand-600" size={28} />
                    Mes Abonnés
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Gérez votre communauté et fidélisez vos clients.</p>
            </div>
            <div className="flex items-center space-x-3">
                <button 
                    onClick={fetchFollowers}
                    className="p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title="Rafraîchir la liste"
                >
                    <RefreshCw size={20} />
                </button>
                <div className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-brand-200 dark:shadow-brand-900/20 flex items-center">
                    <Users size={18} className="mr-2" /> {followers.length} Abonnés
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {followers.map((follow) => {
                // Handle both object and array from Supabase join
                const profile = Array.isArray(follow.profiles) ? follow.profiles[0] : follow.profiles;
                
                return (
                    <div key={follow.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center justify-between hover:shadow-md transition-shadow group">
                        <div className="flex items-center space-x-3">
                            <div className="w-12 h-12 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 font-black text-lg group-hover:scale-110 transition-transform">
                                {profile?.full_name?.charAt(0) || 'U'}
                            </div>
                            <div>
                                <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                    {profile?.full_name || (follow.user_id ? `Client #${follow.user_id.substring(0, 5)}` : 'Utilisateur')}
                                </h4>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center">
                                    <Clock size={10} className="mr-1" /> Abonné depuis le {new Date(follow.created_at).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                        <button className="p-2 text-gray-400 hover:text-brand-600 transition-colors">
                            <MessageSquare size={18} />
                        </button>
                    </div>
                );
            })}
            {followers.length === 0 && (
                <div className="col-span-full py-20 text-center bg-white dark:bg-gray-800 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                    <div className="bg-brand-50 dark:bg-brand-900/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-brand-600">
                        <Heart size={32} />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-bold">Vous n'avez pas encore d'abonnés.</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Publiez des promotions pour attirer plus de clients !</p>
                </div>
            )}
        </div>
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
            <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Gestion de l'Équipe</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Gérez les accès de votre personnel.</p>
            </div>
            <button 
                onClick={() => setIsAddingStaff(true)}
                className="bg-brand-600 text-white px-4 py-2 rounded-xl font-bold text-sm shadow-lg shadow-brand-200 dark:shadow-brand-900/20 flex items-center hover:bg-brand-700 transition-colors"
            >
                <Plus size={18} className="mr-2" /> Ajouter un membre
            </button>
        </div>

        { (isAddingStaff || editingStaff) && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                        {editingStaff ? 'Modifier le membre' : 'Ajouter un membre'}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom complet</label>
                            <input 
                                type="text" 
                                value={newStaffName}
                                onChange={(e) => setNewStaffName(e.target.value)}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                placeholder="Jean Dupont"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rôle</label>
                            <select 
                                value={newStaffRole}
                                onChange={(e) => setNewStaffRole(e.target.value as any)}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                            >
                                <option value="cook">Cuisinier</option>
                                <option value="manager">Gérant</option>
                                <option value="admin">Administrateur</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Code PIN (Optionnel)</label>
                            <input 
                                type="text" 
                                value={newStaffPin}
                                onChange={(e) => setNewStaffPin(e.target.value)}
                                className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                placeholder="1234"
                                maxLength={4}
                            />
                            <p className="text-xs text-gray-500 mt-1">Utilisé pour se connecter au système de caisse (POS).</p>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end space-x-3">
                        <button 
                            onClick={() => {
                                setIsAddingStaff(false);
                                setEditingStaff(null);
                                setNewStaffName('');
                                setNewStaffRole('cook');
                                setNewStaffPin('');
                            }}
                            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                        >
                            Annuler
                        </button>
                        <button 
                            onClick={handleSaveStaff}
                            disabled={isSavingStaff}
                            className="px-4 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-colors disabled:opacity-50"
                        >
                            {isSavingStaff ? 'Enregistrement...' : (editingStaff ? 'Modifier' : 'Ajouter')}
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                            <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nom</th>
                            <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rôle</th>
                            <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Code PIN (POS)</th>
                            <th className="p-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="p-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold mr-3">
                                        {user.name.charAt(0)}
                                    </div>
                                    <span className="font-bold text-gray-900 dark:text-white">{user.name} (Vous)</span>
                                </div>
                            </td>
                            <td className="p-4">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                    Propriétaire
                                </span>
                            </td>
                            <td className="p-4 text-gray-500 dark:text-gray-400 text-sm">-</td>
                            <td className="p-4 text-right">
                                <span className="text-xs text-gray-400 italic">Non modifiable</span>
                            </td>
                        </tr>
                        {staffMembers.map((staff) => (
                            <tr key={staff.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center">
                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold mr-3">
                                            {staff.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-gray-900 dark:text-white">{staff.name}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        staff.role === 'admin' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                        staff.role === 'manager' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    }`}>
                                        {staff.role === 'admin' ? 'Administrateur' : staff.role === 'manager' ? 'Gérant' : 'Cuisinier'}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-900 dark:text-white font-mono text-sm">
                                    {staff.pin_code ? '••••' : 'Non défini'}
                                </td>
                                <td className="p-4 text-right">
                                    <button 
                                        onClick={() => {
                                            setEditingStaff(staff);
                                            setNewStaffName(staff.name);
                                            setNewStaffRole(staff.role);
                                            setNewStaffPin(staff.pin_code || '');
                                        }}
                                        className="text-gray-400 hover:text-brand-600 transition-colors p-1"
                                    >
                                        <Settings size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteStaff(staff.id)}
                                        className="text-gray-400 hover:text-red-600 transition-colors p-1 ml-2"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {staffMembers.length === 0 && (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                        <Users size={32} className="mx-auto mb-3 opacity-50" />
                        <p>Vous êtes le seul membre de l'équipe pour le moment.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  const renderSettings = () => {
    if (settingsSubView === 'menu') {
        return (
            <div className="space-y-4 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Paramètres</h3>
                
                <button 
                    onClick={() => setSettingsSubView('verification')}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-brand-500 transition-all group"
                >
                    <div className="flex items-center">
                        <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-xl mr-4 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                            <Shield size={24} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-gray-900 dark:text-white">Vérification du compte</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Badge de confiance et documents</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                </button>

                <button 
                    onClick={() => setSettingsSubView('content')}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-brand-500 transition-all group"
                >
                    <div className="flex items-center">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-xl mr-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                            <Edit3 size={24} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-gray-900 dark:text-white">Mise à jour du contenu</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Photo, nom, description</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                </button>

                <button 
                    onClick={() => setSettingsSubView('privacy')}
                    className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-brand-500 transition-all group"
                >
                    <div className="flex items-center">
                        <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-xl mr-4 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                            <Settings size={24} />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-gray-900 dark:text-white">Paramètres et confidentialité</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Mode sombre, notifications, sécurité</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                </button>

                <div className="pt-8">
                    <button 
                        onClick={onLogout}
                        className="w-full flex items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl border border-red-100 dark:border-red-900/30 hover:bg-red-100 transition-all font-bold"
                    >
                        <LogOut size={20} className="mr-2" />
                        Se déconnecter
                    </button>
                </div>
            </div>
        );
    }

    if (settingsSubView === 'verification') {
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <button onClick={() => setSettingsSubView('menu')} className="flex items-center text-brand-600 font-bold mb-4">
                    <Plus className="rotate-45 mr-1" size={20}/> Retour
                </button>
                {renderVerification()}
            </div>
        );
    }

    if (settingsSubView === 'content') {
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <button onClick={() => setSettingsSubView('menu')} className="flex items-center text-brand-600 font-bold mb-4">
                    <Plus className="rotate-45 mr-1" size={20}/> Retour
                </button>
                
                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mb-6">
                    <h3 className="font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700 flex items-center">
                        <Users size={20} className="mr-2 text-brand-600"/> Informations du Responsable
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Nom complet</label>
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    className="flex-1 p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                    defaultValue={user.name}
                                    id="owner_name_input"
                                />
                                <button 
                                    onClick={async () => {
                                        const newName = (document.getElementById('owner_name_input') as HTMLInputElement).value;
                                        if (!newName) return;
                                        try {
                                            const { error } = await supabase.from('profiles').update({ full_name: newName }).eq('id', user.id);
                                            if (error) throw error;
                                            toast.success("Nom mis à jour !");
                                            onUpdateUser({ ...user, name: newName });
                                        } catch (err) {
                                            toast.error("Erreur lors de la mise à jour du nom.");
                                        }
                                    }}
                                    className="bg-brand-600 text-white px-4 rounded-xl font-bold hover:bg-brand-700"
                                >
                                    Mettre à jour
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Email (Non modifiable)</label>
                            <input
                                type="email"
                                disabled
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                value={user.email || ''}
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mb-6">
                    <h3 className="font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700 flex items-center">
                        <Lock size={20} className="mr-2 text-brand-600"/> Sécurité du Compte
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Nouveau mot de passe</label>
                            <div className="flex space-x-2">
                                <input
                                    type="password"
                                    className="flex-1 p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                    placeholder="••••••••"
                                    id="new_password_input"
                                />
                                <button 
                                    onClick={async () => {
                                        const newPassword = (document.getElementById('new_password_input') as HTMLInputElement).value;
                                        if (!newPassword || newPassword.length < 6) {
                                            toast.error("Le mot de passe doit contenir au moins 6 caractères.");
                                            return;
                                        }
                                        try {
                                            const { error } = await supabase.auth.updateUser({ password: newPassword });
                                            if (error) throw error;
                                            toast.success("Mot de passe mis à jour !");
                                            (document.getElementById('new_password_input') as HTMLInputElement).value = '';
                                        } catch (err) {
                                            toast.error("Erreur lors de la mise à jour du mot de passe.");
                                        }
                                    }}
                                    className="bg-brand-600 text-white px-4 rounded-xl font-bold hover:bg-brand-700"
                                >
                                    Changer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl">
                    <h3 className="font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700">Configuration du Restaurant</h3>
                    <form onSubmit={saveSettings} className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Nom de l'établissement</label>
                            <input
                                type="text"
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                value={settingsForm.name}
                                onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Numéro de téléphone (Public)</label>
                            <input
                                type="tel"
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                placeholder="+243..."
                                value={settingsForm.phoneNumber}
                                onChange={e => setSettingsForm({ ...settingsForm, phoneNumber: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Description</label>
                            <textarea
                                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all h-32"
                                value={settingsForm.description}
                                onChange={e => setSettingsForm({ ...settingsForm, description: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Photo de profil / Couverture</label>
                            <div className="space-y-2">
                                <input
                                    type="text"
                                    className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                    value={settingsForm.coverImage}
                                    onChange={e => setSettingsForm({ ...settingsForm, coverImage: e.target.value })}
                                    placeholder="URL ou Upload"
                                />
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const file = await pickImage();
                                        if (file) setCoverImageFile(file);
                                    }}
                                    className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-bold flex items-center justify-center border border-gray-300 dark:border-gray-600"
                                >
                                    <Upload size={16} className="mr-2"/>
                                    {coverImageFile ? 'Image sélectionnée' : 'Uploader une image'}
                                </button>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSavingSettings}
                                className="bg-brand-600 text-white font-bold py-4 px-8 rounded-xl hover:bg-brand-700 shadow-lg transition-transform active:scale-95 flex items-center"
                            >
                                {isSavingSettings ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                        Sauvegarde...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2" size={20} />
                                        Enregistrer les modifications
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    if (settingsSubView === 'privacy') {
        return (
            <div className="space-y-6 animate-in slide-in-from-right duration-300">
                <button onClick={() => setSettingsSubView('menu')} className="flex items-center text-brand-600 font-bold mb-4">
                    <Plus className="rotate-45 mr-1" size={20}/> Retour
                </button>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                            {theme === 'light' ? <Sun size={20} className="mr-2 text-orange-500"/> : <Moon size={20} className="mr-2 text-blue-400"/>}
                            Apparence
                        </h3>
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => setTheme('light')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm border ${theme === 'light' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                            >
                                Clair
                            </button>
                            <button 
                                onClick={() => setTheme('dark')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-500 text-blue-400' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                            >
                                Sombre
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                            <Type size={20} className="mr-2 text-brand-600"/>
                            Police
                        </h3>
                        {font && setFont && (
                            <select 
                                value={font} 
                                onChange={(e) => setFont(e.target.value as AppFont)}
                                className="w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm p-3 rounded-lg border border-gray-200 dark:border-gray-600 outline-none focus:border-brand-500"
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
                        )}
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center text-lg">
                            <Shield size={24} className="mr-2 text-blue-600"/>
                            Confidentialité et Sécurité
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gérez qui peut voir votre contenu et sécurisez votre compte.</p>
                    </div>
                    
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        <div className="p-6 space-y-6">
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase tracking-wider mb-4 flex items-center">
                                <Eye size={16} className="mr-2"/> Confidentialité
                            </h4>
                            
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">Visibilité du profil</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Contrôlez qui peut voir votre page restaurant.</p>
                                </div>
                                <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                                    <button 
                                        onClick={() => {
                                            setPrivacyProfile('public');
                                            saveAdvancedSettings({ privacyProfile: 'public' });
                                        }}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${privacyProfile === 'public' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-white' : 'text-gray-500'}`}
                                    >
                                        Public
                                    </button>
                                    <button 
                                        onClick={() => {
                                            setPrivacyProfile('private');
                                            saveAdvancedSettings({ privacyProfile: 'private' });
                                        }}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${privacyProfile === 'private' ? 'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-white' : 'text-gray-500'}`}
                                    >
                                        Privé
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase tracking-wider mb-4 flex items-center">
                                <Bell size={16} className="mr-2"/> Notifications
                            </h4>
                            
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-gray-900 dark:text-white">Notifications Push</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Pour les nouvelles commandes et messages.</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        const granted = await requestNotificationPermission();
                                        setNotifPush(granted);
                                        saveAdvancedSettings({ notifPush: granted });
                                        if (granted) {
                                            toast.success("Notifications activées avec succès !");
                                            sendPushNotification("Test de notification", { body: "Les notifications fonctionnent correctement." });
                                        } else {
                                            const isInIframe = window.self !== window.top;
                                            if (isInIframe) {
                                                toast.error("Les notifications sont bloquées dans l'aperçu. Veuillez ouvrir l'application dans un nouvel onglet pour les activer.");
                                            } else {
                                                toast.error("Permission refusée ou non supportée par votre appareil.");
                                            }
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${notifPush ? 'bg-green-500 text-white' : 'bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100'}`}
                                >
                                    {notifPush ? 'Activé' : 'Activer'}
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase tracking-wider mb-4 flex items-center">
                                <Lock size={16} className="mr-2"/> Sécurité Avancée
                            </h4>
                            
                            <div className="space-y-4">
                                {/* App Lock */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center">
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded-lg mr-3 text-gray-600 dark:text-gray-300 shadow-sm">
                                            <Lock size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">Verrouillage de l'application</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Demander un PIN à l'ouverture.</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            if (appLockEnabled) {
                                                setAppLockEnabled(false);
                                                saveAdvancedSettings({ appLockEnabled: false });
                                            } else {
                                                setIsPinSetupOpen(true);
                                            }
                                        }}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${appLockEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${appLockEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {/* Biometrics */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center">
                                        <div className="bg-white dark:bg-gray-800 p-2 rounded-lg mr-3 text-gray-600 dark:text-gray-300 shadow-sm">
                                            <Fingerprint size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 dark:text-white">Biométrie (Face ID / Empreinte)</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Utiliser les capteurs du téléphone.</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const newVal = !biometricsEnabled;
                                            setBiometricsEnabled(newVal);
                                            saveAdvancedSettings({ biometricsEnabled: newVal });
                                        }}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${biometricsEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${biometricsEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {/* 2FA */}
                                <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                                    <div className="flex items-center">
                                        <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-lg mr-3 text-blue-600 dark:text-blue-300">
                                            <Smartphone size={20} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-blue-900 dark:text-blue-300">Authentification à deux facteurs</p>
                                            <p className="text-xs text-blue-700 dark:text-blue-400">Protégez votre compte avec un code SMS.</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const val = !twoFactorEnabled;
                                            setTwoFactorEnabled(val);
                                            saveAdvancedSettings({ twoFactorEnabled: val });
                                        }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${twoFactorEnabled ? 'bg-green-500 text-white' : 'bg-white text-blue-600 border border-blue-200'}`}
                                    >
                                        {twoFactorEnabled ? 'Activé' : 'Activer'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="font-bold text-red-600">Zone Danger</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Actions irréversibles.</p>
                                </div>
                                <button className="flex items-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-4 py-2 rounded-lg transition-colors text-xs font-bold">
                                    <UserX size={16} className="mr-2"/> Supprimer mon compte
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-20">
        <h2 className="text-2xl font-black text-gray-800 dark:text-white">Paramètres</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
                onClick={() => setSettingsSubView('verification')}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center hover:border-brand-500 transition-all group"
            >
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                    <CheckCircle size={24} />
                </div>
                <div className="text-left">
                    <p className="font-bold text-gray-900 dark:text-white">Vérification du compte</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Gérez vos documents et votre statut.</p>
                </div>
            </button>

            <button 
                onClick={() => setSettingsSubView('content')}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center hover:border-brand-500 transition-all group"
            >
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                    <UserIcon size={24} />
                </div>
                <div className="text-left">
                    <p className="font-bold text-gray-900 dark:text-white">Mise à jour du contenu</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Photo, nom, mot de passe et infos resto.</p>
                </div>
            </button>

            <button 
                onClick={() => setSettingsSubView('privacy')}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center hover:border-brand-500 transition-all group"
            >
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                    <Shield size={24} />
                </div>
                <div className="text-left">
                    <p className="font-bold text-gray-900 dark:text-white">Paramètres et confidentialité</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Mode sombre, notifications, sécurité.</p>
                </div>
            </button>

            <button 
                onClick={onLogout}
                className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 flex items-center hover:bg-red-50 dark:hover:bg-red-900/10 transition-all group"
            >
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                    <LogOut size={24} />
                </div>
                <div className="text-left">
                    <p className="font-bold text-red-600">Se déconnecter</p>
                    <p className="text-xs text-red-400">Quitter votre session actuelle.</p>
                </div>
            </button>
        </div>
      </div>
    );
  };


  const renderOrders = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-black text-gray-800 dark:text-white">Commandes ({filteredOrders.length})</h2>
          
          <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
              <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                  <button onClick={() => setOrderFilter('active')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${orderFilter === 'active' ? 'bg-white dark:bg-gray-600 shadow-sm text-brand-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>En cours</button>
                  <button onClick={() => setOrderFilter('completed')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${orderFilter === 'completed' ? 'bg-white dark:bg-gray-600 shadow-sm text-brand-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Terminées</button>
                  <button onClick={() => setOrderFilter('all')} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${orderFilter === 'all' ? 'bg-white dark:bg-gray-600 shadow-sm text-brand-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Toutes</button>
              </div>

              <button 
                onClick={refreshOrders}
                disabled={isRefreshing}
                className="flex items-center space-x-2 text-sm font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 px-3 py-2 rounded-lg transition-colors flex-shrink-0"
              >
                  <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              </button>
          </div>
      </div>
      
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
           <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <ShoppingBag className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">Aucune commande {orderFilter === 'active' ? 'en cours' : orderFilter === 'completed' ? 'terminée' : ''}.</p>
           </div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-5 duration-300">
               <div className="flex flex-col md:flex-row justify-between md:items-start mb-4">
                  <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">Commande #{order.id.slice(0,6)}</h3>
                        {getStatusBadge(order.status)}
                        {order.isUrgent && (
                          <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold uppercase flex items-center shadow-sm animate-pulse-fast">
                            <Zap size={12} className="mr-1 fill-white" /> Urgent
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                         <span className="font-bold mr-1">{order.customer?.full_name}</span> 
                         • {new Date(order.createdAt).toLocaleString()}
                      </p>
                      {order.customer?.phone_number && (
                          <div className="flex items-center text-xs text-brand-600 dark:text-brand-400 font-bold mt-1 cursor-pointer" onClick={() => window.open(`tel:${order.customer?.phone_number}`)}>
                              <Phone size={12} className="mr-1"/> {order.customer?.phone_number}
                          </div>
                      )}
                      {order.deliveryLocation && (
                          <div className="flex items-start text-xs text-gray-600 dark:text-gray-300 mt-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                              <MapPin size={14} className="mr-1.5 mt-0.5 text-brand-600 flex-shrink-0"/> 
                              <div>
                                  <span className="font-bold block">Adresse de livraison:</span>
                                  {order.deliveryLocation.address}
                                  <a 
                                    href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryLocation.lat},${order.deliveryLocation.lng}`} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-brand-600 hover:underline block mt-1 font-medium"
                                  >
                                    Ouvrir dans Google Maps
                                  </a>
                              </div>
                          </div>
                      )}
                  </div>
                  <div className="mt-4 md:mt-0 text-right">
                      <p className="text-2xl font-black text-brand-600">${(order.totalAmount || 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-400 font-bold uppercase">{order.items.length} articles</p>
                  </div>
               </div>

               <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-4 mb-4 space-y-2">
                  {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                          <div className="flex items-center">
                              {order.status === 'pending' ? (
                                  <div className="flex items-center bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded-md mr-3">
                                      <button 
                                          onClick={() => updateOrderItemQuantity(order.id, i, item.quantity - 1)}
                                          className="px-2 py-0.5 text-gray-500 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
                                      >
                                          -
                                      </button>
                                      <span className="font-bold text-xs px-1 min-w-[1.5rem] text-center dark:text-white">
                                          {item.quantity}
                                      </span>
                                      <button 
                                          onClick={() => updateOrderItemQuantity(order.id, i, item.quantity + 1)}
                                          className="px-2 py-0.5 text-gray-500 hover:text-brand-600 dark:text-gray-300 dark:hover:text-brand-400"
                                      >
                                          +
                                      </button>
                                  </div>
                              ) : (
                                  <span className="font-bold bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 w-6 h-6 flex items-center justify-center rounded-md mr-3 text-xs dark:text-white">
                                      {item.quantity}
                                  </span>
                              )}
                              <span className="text-gray-700 dark:text-gray-200">{item.name}</span>
                          </div>
                          <span className="font-bold text-gray-900 dark:text-white">${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                      </div>
                  ))}
               </div>

               {order.paymentProof && (
                   <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                       <div>
                           <p className="text-xs font-bold text-blue-800 dark:text-blue-300 mb-2">Preuve de paiement jointe :</p>
                           <a href={order.paymentProof} target="_blank" rel="noopener noreferrer" className="block w-32 h-32 rounded-lg overflow-hidden border-2 border-blue-200 hover:opacity-80 transition-opacity">
                               <img src={order.paymentProof} alt="Preuve de paiement" className="w-full h-full object-cover" />
                           </a>
                       </div>
                       {order.status === 'pending' && order.paymentStatus !== 'paid' && (
                           <div className="flex flex-col gap-2 w-full md:w-auto">
                               <button 
                                   onClick={() => updatePaymentStatus(order.id, 'paid')}
                                   className="px-4 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 shadow-sm"
                               >
                                   Confirmer le paiement
                               </button>
                               <button 
                                   onClick={() => updatePaymentStatus(order.id, 'failed')}
                                   className="px-4 py-2 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-200 dark:hover:bg-red-900/50 shadow-sm"
                               >
                                   Demander une nouvelle preuve
                               </button>
                           </div>
                       )}
                   </div>
               )}

               <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-gray-100 dark:border-gray-700">
                   {order.customer?.phone_number && (
                       <button 
                          onClick={() => window.open(`tel:${order.customer?.phone_number}`)}
                          className="px-4 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-xs font-bold hover:bg-green-100 dark:hover:bg-green-900/40 flex items-center"
                       >
                           <Phone size={14} className="mr-2"/> Appeler
                       </button>
                   )}
                   <button 
                      onClick={() => openChat(order)}
                      className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 flex items-center"
                   >
                       <MessageSquare size={14} className="mr-2"/> Message Client
                   </button>
                   
                   {order.status === 'pending' && (
                       <>
                           <button onClick={() => updateOrderStatus(order.id, 'cancelled')} className="px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/40">Refuser</button>
                           <button onClick={() => updateOrderStatus(order.id, 'preparing')} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-bold hover:bg-brand-700 shadow-md">Accepter & Cuisiner</button>
                       </>
                   )}
                   {order.status === 'preparing' && (
                       <button onClick={() => updateOrderStatus(order.id, 'ready')} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold hover:bg-orange-600 shadow-md">Marquer Prêt</button>
                   )}
                   {order.status === 'ready' && (
                       <button onClick={() => updateOrderStatus(order.id, 'delivering')} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600 shadow-md">En Livraison</button>
                   )}
                   {order.status === 'delivering' && (
                       <button onClick={() => updateOrderStatus(order.id, 'completed')} className="px-4 py-2 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 shadow-md">Terminer (Livré)</button>
                   )}
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const [adjustingStockItem, setAdjustingStockItem] = useState<MenuItem | null>(null);
  const [newStockValue, setNewStockValue] = useState('');

  const handleAdjustStock = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!adjustingStockItem) return;

      const newStock = parseInt(newStockValue);
      if (isNaN(newStock) || newStock < 0) {
          toast.error("Veuillez entrer une valeur de stock valide.");
          return;
      }

      try {
          const { error } = await supabase
              .from('menu_items')
              .update({ stock: newStock })
              .eq('id', adjustingStockItem.id);

          if (error) throw error;

          const updatedMenu = restaurant.menu.map(m => m.id === adjustingStockItem.id ? { ...m, stock: newStock } : m);
          onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
          toast.success("Stock mis à jour !");
          setAdjustingStockItem(null);
          setNewStockValue('');
      } catch (err) {
          console.error("Error updating stock:", err);
          toast.error("Erreur lors de la mise à jour du stock.");
      }
  };

  const renderSalesAndInventory = () => {
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayRevenue = completedOrders
        .filter(o => new Date(o.createdAt).toISOString().split('T')[0] === dateStr)
        .reduce((sum, o) => sum + o.totalAmount, 0);
      chartData.push({
        name: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
        ventes: dayRevenue
      });
    }

    return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <h2 className="text-2xl font-black text-gray-800 dark:text-white">Ventes & Inventaire</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 lg:col-span-2">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
            <TrendingUp size={20} className="mr-2 text-brand-600"/> Aperçu des Ventes
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
             <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                 <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Total Global</p>
                 <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">${revenue.toFixed(2)}</p>
             </div>
             <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                 <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Ce Mois</p>
                 <p className="text-2xl font-black text-brand-600 dark:text-brand-400 mt-1">${monthlyRevenue.toFixed(2)}</p>
             </div>
             <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-xl">
                 <p className="text-sm font-bold text-gray-500 dark:text-gray-400">Aujourd'hui</p>
                 <p className="text-2xl font-black text-green-600 dark:text-green-400 mt-1">${dailyRevenue.toFixed(2)}</p>
             </div>
          </div>

          <div className="h-64 w-full mb-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ventes']}
                />
                <Line type="monotone" dataKey="ventes" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, fill: '#4f46e5', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3 text-sm uppercase tracking-wider">Top 5 Produits Vendus</h4>
          <div className="space-y-2">
              {topSellingProducts.map((product, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center">
                          <span className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold mr-3">{index + 1}</span>
                          <span className="font-bold text-gray-800 dark:text-gray-200">{product.name}</span>
                      </div>
                      <div className="text-right">
                          <p className="font-bold text-gray-900 dark:text-white">{product.quantity} vendus</p>
                          <p className="text-xs text-brand-600 dark:text-brand-400">${product.revenue.toFixed(2)}</p>
                      </div>
                  </div>
              ))}
              {topSellingProducts.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucune vente enregistrée pour le moment.</p>
              )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
            <Package size={20} className="mr-2 text-brand-600"/> Alertes Stock
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {restaurant.menu.filter(item => item.stock !== undefined).sort((a, b) => (a.stock || 0) - (b.stock || 0)).map(item => {
              const threshold = item.lowStockThreshold || 5;
              const isLowStock = item.stock! <= threshold;
              return (
              <div key={item.id} className={`flex flex-col p-3 rounded-xl border ${isLowStock ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700 border-transparent'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200 block">{item.name}</span>
                        {isLowStock && <span className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center mt-1"><AlertCircle size={12} className="mr-1"/> Stock Faible (≤ {threshold})</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className={`text-sm font-black px-3 py-1 rounded-full ${item.stock! > threshold * 2 ? 'bg-green-100 text-green-700' : item.stock! > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                          {item.stock}
                        </span>
                        <button 
                            onClick={() => {
                                setAdjustingStockItem(item);
                                setNewStockValue(item.stock!.toString());
                            }}
                            className="p-1 text-gray-400 hover:text-brand-600 transition-colors"
                        >
                            <Settings size={16} />
                        </button>
                    </div>
                </div>
                {adjustingStockItem?.id === item.id && (
                    <form onSubmit={handleAdjustStock} className="mt-3 flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
                        <input 
                            type="number" 
                            className="w-20 p-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-800 dark:text-white"
                            value={newStockValue}
                            onChange={(e) => setNewStockValue(e.target.value)}
                            min="0"
                        />
                        <button type="submit" className="bg-brand-600 text-white p-1.5 rounded hover:bg-brand-700">
                            <CheckCircle size={14} />
                        </button>
                        <button type="button" onClick={() => setAdjustingStockItem(null)} className="bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-500">
                            <X size={14} />
                        </button>
                    </form>
                )}
              </div>
            )})}
            {restaurant.menu.filter(item => item.stock !== undefined).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucun article avec suivi de stock.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )};

  const renderMarketing = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-black text-gray-800 dark:text-white">{t('marketing_title')}</h2>
            <button 
                onClick={() => setIsAddingPromo(!isAddingPromo)}
                className="flex items-center bg-brand-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-brand-700 transition-colors shadow-lg"
            >
                <Plus size={18} className="mr-2" /> {t('new_story')}
            </button>
        </div>

        {isAddingPromo && (
            <form onSubmit={addPromotion} className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-2xl border border-purple-100 dark:border-purple-800 shadow-sm animate-slide-in-down">
                <h4 className="font-bold text-purple-900 dark:text-purple-300 mb-4 flex items-center"><Megaphone size={18} className="mr-2"/> {t('create_promo')}</h4>
                
                {promoError && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border-l-4 border-red-500 text-red-700 dark:text-red-400 text-sm flex items-center animate-in fade-in slide-in-from-top-2">
                        <AlertCircle size={16} className="mr-2 flex-shrink-0" />
                        <span>{promoError}</span>
                        <button onClick={() => setPromoError(null)} className="ml-auto text-red-500 hover:text-red-700">
                            <X size={14} />
                        </button>
                    </div>
                )}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{t('media_type')}</label>
                        <div className="flex space-x-4">
                            <label className={`flex items-center space-x-2 cursor-pointer p-3 rounded-xl border ${newPromoType === 'image' ? 'bg-white dark:bg-gray-800 border-purple-500 text-purple-700 dark:text-purple-300' : 'bg-transparent border-transparent text-gray-500'}`}>
                                <input type="radio" name="type" className="hidden" checked={newPromoType === 'image'} onChange={() => { setNewPromoType('image'); setPromoFile(null); setNewPromoUrl(''); }} />
                                <ImageIcon size={20} />
                                <span className="font-bold text-sm">{t('image')}</span>
                            </label>
                            <label className={`flex items-center space-x-2 cursor-pointer p-3 rounded-xl border ${newPromoType === 'video' ? 'bg-white dark:bg-gray-800 border-purple-500 text-purple-700 dark:text-purple-300' : 'bg-transparent border-transparent text-gray-500'}`}>
                                <input type="radio" name="type" className="hidden" checked={newPromoType === 'video'} onChange={() => { setNewPromoType('video'); setPromoFile(null); setNewPromoUrl(''); }} />
                                <Video size={20} />
                                <span className="font-bold text-sm">{t('video')}</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{t('media_file_url')}</label>
                        
                        <div className="mb-3">
                             <label className={`cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-4 rounded-xl font-bold flex flex-col items-center justify-center border-dashed border-2 ${promoFile ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : ''}`}>
                                <Upload size={24} className={`mb-2 ${promoFile ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`}/>
                                <span className="text-sm">{promoFile ? promoFile.name : (newPromoType === 'video' ? t('upload_video') : t('upload_image'))}</span>
                                <input 
                                    type="file" 
                                    accept={newPromoType === 'video' ? "video/*" : "image/*"} 
                                    className="hidden" 
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            setPromoFile(file);
                                            setNewPromoUrl('');
                                            setPromoError(null);
                                        }
                                    }} 
                                />
                            </label>
                        </div>

                        {(promoFile || newPromoUrl) && (
                            <div className="mb-4 relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-gray-200 dark:border-gray-700">
                                {newPromoType === 'image' ? (
                                    <img 
                                        src={promoFile ? URL.createObjectURL(promoFile) : newPromoUrl} 
                                        alt="Preview" 
                                        className="w-full h-full object-contain"
                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                    />
                                ) : (
                                    <video 
                                        src={promoFile ? URL.createObjectURL(promoFile) : newPromoUrl} 
                                        controls
                                        className="w-full h-full"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setPromoFile(null); setNewPromoUrl(''); }}
                                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full shadow-md hover:bg-red-600"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold">{t('or_link')}</span>
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                        </div>

                        <input 
                            type="url" 
                            className={`w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none ${promoFile ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-white dark:bg-gray-800 dark:text-white'}`}
                            placeholder={newPromoType === 'video' ? "https://... (Lien vidéo MP4)" : "https://... (Lien image)"}
                            value={newPromoUrl}
                            onChange={e => {
                                setNewPromoUrl(e.target.value);
                                if (e.target.value) {
                                    setPromoFile(null);
                                    setPromoError(null);
                                }
                            }}
                            disabled={!!promoFile}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{t('caption')}</label>
                        <input 
                            type="text" 
                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none dark:bg-gray-800 dark:text-white"
                            placeholder="Ex: -50% aujourd'hui seulement !"
                            value={newPromoCaption}
                            onChange={e => setNewPromoCaption(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button 
                            type="submit"
                            disabled={loading}
                            className="bg-purple-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-purple-700 shadow-lg flex items-center"
                        >
                            {loading ? t('publishing') : t('publish')}
                        </button>
                    </div>
                </div>
            </form>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {promotions.map(promo => (
                <div key={promo.id} className="group relative aspect-[9/16] rounded-2xl overflow-hidden shadow-md bg-black">
                    {promo.mediaType === 'video' ? (
                        <video src={promo.mediaUrl} className="w-full h-full object-cover opacity-80" muted />
                    ) : (
                        <img src={promo.mediaUrl} alt="Promo" className="w-full h-full object-cover opacity-80" />
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-4">
                        <p className="text-white font-bold text-sm line-clamp-2 mb-2">{promo.caption || 'Sans légende'}</p>
                        <p className="text-[10px] text-gray-300">{new Date(promo.createdAt).toLocaleDateString()}</p>
                    </div>

                    <button 
                        onClick={() => deletePromotion(promo.id)}
                        className="absolute top-2 right-2 p-2 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                        <Trash2 size={16} />
                    </button>
                    
                    {promo.mediaType === 'video' && (
                        <div className="absolute top-2 left-2 p-1 bg-black/50 rounded text-white">
                            <PlayCircle size={16} />
                        </div>
                    )}
                </div>
            ))}
            {promotions.length === 0 && !isAddingPromo && (
                <div className="col-span-full text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                    <Megaphone className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400">{t('no_promos')}</p>
                    <p className="text-xs text-gray-400">{t('add_stories')}</p>
                </div>
            )}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Campagnes Automatisées</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Envoyez des notifications push automatiquement.</p>
                </div>
                <button 
                    onClick={() => setIsAddingCampaign(true)}
                    className="flex items-center bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 px-4 py-2 rounded-xl font-bold hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors shadow-sm"
                >
                    <Plus size={18} className="mr-2" /> Nouvelle campagne
                </button>
            </div>

            { (isAddingCampaign || editingCampaign) && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {editingCampaign ? 'Modifier la campagne' : 'Créer une campagne'}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom de la campagne</label>
                                <input 
                                    type="text" 
                                    value={newCampaignName}
                                    onChange={(e) => setNewCampaignName(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                    placeholder="Ex: Relance panier"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Déclencheur</label>
                                <select 
                                    value={newCampaignTrigger}
                                    onChange={(e) => setNewCampaignTrigger(e.target.value as any)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                >
                                    <option value="abandoned_cart">Panier abandonné (après 2h)</option>
                                    <option value="dormant_30_days">Client inactif (30 jours)</option>
                                    <option value="birthday">Anniversaire du client</option>
                                    <option value="new_customer">Nouveau client (Bienvenue)</option>
                                    <option value="loyal_customer">Client fidèle (5+ commandes)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message de la notification</label>
                                <textarea 
                                    value={newCampaignMessage}
                                    onChange={(e) => setNewCampaignMessage(e.target.value)}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none resize-none h-24"
                                    placeholder="Ex: Vous avez oublié quelque chose ! Profitez de -10% pour finaliser votre commande."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Réduction (%)</label>
                                <input 
                                    type="number" 
                                    value={newCampaignDiscount}
                                    onChange={(e) => setNewCampaignDiscount(Number(e.target.value))}
                                    className="w-full p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                                    min="0"
                                    max="100"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end space-x-3">
                            <button 
                                onClick={() => {
                                    setIsAddingCampaign(false);
                                    setEditingCampaign(null);
                                    setNewCampaignName('');
                                    setNewCampaignMessage('');
                                    setNewCampaignDiscount(10);
                                }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl font-medium transition-colors"
                            >
                                Annuler
                            </button>
                            <button 
                                onClick={handleSaveCampaign}
                                disabled={isSavingCampaign}
                                className="px-4 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition-colors disabled:opacity-50"
                            >
                                {isSavingCampaign ? 'Enregistrement...' : (editingCampaign ? 'Modifier' : 'Créer')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {automatedCampaigns.map(campaign => (
                    <div key={campaign.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm relative group">
                        <div className="flex justify-between items-start mb-3">
                            <div className={`p-2 rounded-lg ${
                                campaign.trigger_type === 'abandoned_cart' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' :
                                campaign.trigger_type === 'dormant_30_days' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                campaign.trigger_type === 'new_customer' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                campaign.trigger_type === 'loyal_customer' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                                'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400'
                            }`}>
                                {campaign.trigger_type === 'abandoned_cart' ? <ShoppingCart size={20} /> :
                                 campaign.trigger_type === 'dormant_30_days' ? <Clock size={20} /> :
                                 campaign.trigger_type === 'new_customer' ? <UserPlus size={20} /> :
                                 campaign.trigger_type === 'loyal_customer' ? <Award size={20} /> :
                                 <Gift size={20} />}
                            </div>
                            <div className="flex items-center space-x-2">
                                <button 
                                    onClick={() => handleToggleCampaign(campaign.id, campaign.is_active)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${campaign.is_active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                                >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${campaign.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                                </button>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{campaign.is_active ? 'Active' : 'Inactive'}</span>
                            </div>
                        </div>
                        <h4 className="font-bold text-gray-900 dark:text-white mb-1">{campaign.name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{campaign.message_body}</p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-bold text-gray-900 dark:text-white">{campaign.discount_percentage}%</span> de réduction
                            </div>
                            <div className="flex items-center space-x-3">
                                <button 
                                    onClick={() => {
                                        setEditingCampaign(campaign);
                                        setNewCampaignName(campaign.name);
                                        setNewCampaignTrigger(campaign.trigger_type);
                                        setNewCampaignMessage(campaign.message_body);
                                        setNewCampaignDiscount(campaign.discount_percentage);
                                    }}
                                    className="text-brand-600 dark:text-brand-400 text-xs font-bold hover:underline"
                                >
                                    Modifier
                                </button>
                                <button 
                                    onClick={() => handleDeleteCampaign(campaign.id)}
                                    className="text-red-500 hover:text-red-700 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {automatedCampaigns.length === 0 && (
                    <div className="col-span-full text-center py-10 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                        <Zap className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-bold">Aucune campagne automatisée.</p>
                        <p className="text-xs text-gray-400 mt-1">Créez des campagnes pour relancer vos clients automatiquement.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex transition-colors duration-300">
      
      {showNotification && (
          <div className="fixed top-4 right-4 z-[100] bg-white dark:bg-gray-800 border-l-4 border-brand-600 shadow-xl rounded-lg p-4 animate-in slide-in-from-right duration-300 flex items-center max-w-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700" onClick={() => { setShowNotification(false); navigateTo('orders'); }}>
              <div className="bg-brand-100 dark:bg-brand-900/30 p-2 rounded-full mr-3 text-brand-600 dark:text-brand-400">
                  <Bell size={20} />
              </div>
              <div>
                  <h4 className="font-bold text-gray-900 dark:text-white text-sm">Nouvelle Commande !</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Un client vient de passer commande.</p>
              </div>
          </div>
      )}

      {activeChatOrder && (
          <ChatWindow 
            orderId={activeChatOrder.id}
            currentUser={{ 
                id: user.role === 'staff' ? restaurant.ownerId : user.id, 
                role: 'business' 
            }}
            otherUserName={activeChatOrder.customer?.full_name || 'Client'}
            otherUserPhone={activeChatOrder.customer?.phone_number || ''}
            onClose={closeChat}
          />
      )}

      <aside className="hidden md:flex w-64 flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-screen sticky top-0 transition-colors duration-300">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center space-x-2 mb-2">
                  <div className="bg-white p-1 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                      <img src={APP_LOGO_URL} alt="DashMeals" className="h-8 w-auto object-contain" />
                  </div>
                  <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white leading-none">DashMeals</h1>
              </div>
              <div className="flex flex-col mt-1">
                 <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Espace Partenaire</p>
                 <span className="text-xs font-bold text-gray-800 dark:text-white mt-1 flex items-center">
                    {user.name}
                    {restaurant.isVerified && (
                        <CheckCircle2 size={14} className="ml-1 text-blue-500" title="Entreprise Vérifiée" />
                    )}
                 </span>
              </div>
          </div>
              <nav className="flex-1 p-4 space-y-2">
              {renderSidebarItem('overview', <LayoutDashboard size={20}/>, t('overview'))}
              {renderSidebarItem('orders', <ShoppingBag size={20}/>, t('orders'), pendingOrdersCount)}
              {renderSidebarItem('menu', <Coffee size={20}/>, t('menu'))}
              {renderSidebarItem('sales', <TrendingUp size={20}/>, 'Ventes & Inventaire')}
              {renderSidebarItem('marketing', <Megaphone size={20}/>, t('marketing'))}
              {renderSidebarItem('marketplace', <Package size={20}/>, 'Marketplace')}
              {renderSidebarItem('subscribers', <Users size={20}/>, 'Abonnés', followers.length)}
              {renderSidebarItem('team', <UserIcon size={20}/>, 'Équipe')}
              {renderSidebarItem('settings', <Settings size={20}/>, t('settings'))}
          </nav>
          <div className="p-4 border-t border-gray-100 dark:border-gray-700">
             <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors font-medium text-sm">
                  <LogOut size={16} />
                  <span>{t('logout')}</span>
              </button>
          </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 px-4 py-3 flex justify-between items-center transition-colors duration-300">
          <div className="flex items-center space-x-2">
              <div className="bg-white p-1 rounded-md shadow-sm border border-gray-100 dark:border-gray-700">
                  <img src={APP_LOGO_URL} alt="DashMeals" className="h-6 w-auto object-contain" />
              </div>
              <h1 className="text-lg font-black tracking-tight text-gray-900 dark:text-white leading-none">DashMeals</h1>
          </div>
          <button onClick={toggleSidebar} className="p-2 text-gray-600 dark:text-gray-300">
             {isSidebarOpen ? <X /> : <LayoutDashboard />}
          </button>
      </div>

      {isSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-gray-800/50 backdrop-blur-sm" onClick={closeSidebar}>
              <div className="w-3/4 h-full bg-white dark:bg-gray-800 p-4 space-y-2 pt-20 transition-colors duration-300" onClick={e => e.stopPropagation()}>
                  <div className="mb-6 px-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">Connecté en tant que</p>
                      <p className="font-bold text-gray-800 dark:text-white">{user.name}</p>
                  </div>
                  {renderSidebarItem('overview', <LayoutDashboard size={20}/>, t('overview'))}
                  {renderSidebarItem('orders', <ShoppingBag size={20}/>, t('orders'), pendingOrdersCount)}
                  {renderSidebarItem('menu', <Coffee size={20}/>, t('menu'))}
                  {renderSidebarItem('sales', <TrendingUp size={20}/>, 'Ventes & Inventaire')}
                  {renderSidebarItem('marketing', <Megaphone size={20}/>, t('marketing'))}
                  {renderSidebarItem('marketplace', <Package size={20}/>, 'Marketplace')}
                  {renderSidebarItem('subscribers', <Users size={20}/>, 'Abonnés', followers.length)}
                  {renderSidebarItem('team', <UserIcon size={20}/>, 'Équipe')}
                  {renderSidebarItem('settings', <Settings size={20}/>, t('settings'))}
                  <button onClick={onLogout} className="w-full flex items-center space-x-3 px-4 py-3 text-red-500 mt-10">
                      <LogOut size={20}/> <span>{t('logout')}</span>
                  </button>
              </div>
          </div>
      )}

      <main className="flex-1 p-6 md:p-10 pt-20 md:pt-10 overflow-y-auto">
          {activeView === 'overview' && renderOverview()}
          {activeView === 'orders' && renderOrders()}
          {activeView === 'menu' && renderMenu()}
          {activeView === 'sales' && renderSalesAndInventory()}
          {activeView === 'marketing' && renderMarketing()}
          {activeView === 'marketplace' && renderMarketplace()}
          {activeView === 'subscribers' && renderSubscribers()}
          {activeView === 'team' && renderTeam()}
          {activeView === 'settings' && renderSettings()}
      </main>

      {/* Marketplace Product Detail Modal */}
      {selectedMarketProduct && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300">
                  <button
                      onClick={() => setSelectedMarketProduct(null)}
                      className="absolute top-4 right-4 z-10 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full backdrop-blur-md transition-colors"
                  >
                      <X size={20} />
                  </button>

                  <div className="h-64 relative">
                      <img
                          src={selectedMarketProduct.image || 'https://picsum.photos/seed/food/800/600'}
                          className="w-full h-full object-cover"
                          alt={selectedMarketProduct.name}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                      <div className="absolute bottom-4 left-6">
                          <h2 className="text-3xl font-black text-white">{selectedMarketProduct.name}</h2>
                          <p className="text-brand-200 font-bold flex items-center mt-1">
                              <ChefHat size={16} className="mr-2" /> {selectedMarketProduct.restaurants?.name}
                          </p>
                      </div>
                  </div>

                  <div className="p-8">
                      <div className="flex items-center justify-between mb-6">
                          <div>
                              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Prix de vente</p>
                              <p className="text-4xl font-black text-brand-600">{formatPrice(selectedMarketProduct.price)}</p>
                          </div>
                          <div className="text-right">
                              <span className={`px-4 py-2 rounded-xl text-sm font-black flex items-center ${selectedMarketProduct.is_available ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                  {selectedMarketProduct.is_available ? <CheckCircle size={16} className="mr-2" /> : <X size={16} className="mr-2" />}
                                  {selectedMarketProduct.is_available ? 'Disponible' : 'Épuisé'}
                              </span>
                          </div>
                      </div>

                      <div className="space-y-6">
                          <div>
                              <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2 flex items-center">
                                  <Info size={16} className="mr-2 text-brand-600" /> Description
                              </h4>
                              <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                  {selectedMarketProduct.description || "Aucune description fournie pour cet article."}
                              </p>
                          </div>

                          <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-100 dark:border-gray-700">
                              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl">
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Stock</p>
                                  <p className="font-bold text-gray-900 dark:text-white">{selectedMarketProduct.stock ?? 'Non suivi'}</p>
                              </div>
                              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-2xl">
                                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Catégorie</p>
                                  <p className="font-bold text-gray-900 dark:text-white capitalize">{selectedMarketProduct.category}</p>
                              </div>
                          </div>
                      </div>

                      <button
                          onClick={() => setSelectedMarketProduct(null)}
                          className="w-full mt-8 py-4 bg-brand-600 text-white rounded-2xl font-black shadow-xl shadow-brand-500/20 hover:bg-brand-700 transition-all active:scale-95"
                      >
                          Fermer
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* PIN Setup Dialog */}
      <PinSetupDialog 
          isOpen={isPinSetupOpen}
          onClose={() => setIsPinSetupOpen(false)}
          onConfirm={(pin) => {
              setAppLockEnabled(true);
              setAppLockPin(pin);
              saveAdvancedSettings({ appLockEnabled: true, appLockPin: pin });
              setIsPinSetupOpen(false);
              toast.success("Code PIN configuré avec succès !");
          }}
      />

    </div>
  );
};