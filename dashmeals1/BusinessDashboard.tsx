import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';
import { APP_LOGO_URL } from './constants';
import { Restaurant, MenuItem, User, Order, OrderStatus, Promotion, Theme, Language, AppFont } from './types';
import { 
  Plus, Trash2, Power, LogOut, Coffee, DollarSign, Clock, Truck, 
  Receipt, CheckCircle, CheckCircle2, ChefHat, Bike, LayoutDashboard, Settings, 
  TrendingUp, Users, ShoppingBag, X, Save, Image as ImageIcon, MapPin,
  MessageSquare, Phone, Megaphone, Video, PlayCircle, Upload, AlertCircle, AlertTriangle, Bell, Moon, Sun, Globe, RefreshCw, Type, Shield,
  Lock, Eye, EyeOff, Smartphone, UserX, ToggleLeft, ToggleRight, Zap, User as UserIcon, Package
} from 'lucide-react';
import { ChatWindow } from './components/ChatWindow';
import { useTranslation } from './lib/i18n';
import { requestNotificationPermission, sendPushNotification } from './utils/notifications';
import { toast } from 'sonner';

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

type DashboardView = 'overview' | 'orders' | 'menu' | 'sales' | 'settings' | 'marketing';

export const BusinessDashboard: React.FC<Props> = ({ user, restaurant, onUpdateRestaurant, onUpdateUser, onLogout, theme, setTheme, language, setLanguage, font, setFont }) => {
  const t = useTranslation(language);
  const [activeView, setActiveView] = useState<DashboardView>(() => (localStorage.getItem('dashpro_active_view') as DashboardView) || 'overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // For mobile
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);

  // History Management
  useEffect(() => {
      if (!window.history.state) {
          window.history.replaceState({ view: 'overview' }, '', '#overview');
      }

      const onPopState = (e: PopStateEvent) => {
          const state = e.state;
          if (state?.view) {
              setActiveView(state.view);
          }
          if (!state?.chat) setActiveChatOrder(null);
          setIsSidebarOpen(!!state?.sidebar);
      };

      window.addEventListener('popstate', onPopState);
      return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (view: DashboardView) => {
      if (view === activeView) return;
      window.history.pushState({ view }, '', `#${view}`);
      setActiveView(view);
      localStorage.setItem('dashpro_active_view', view);
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
  const [isAddingItem, setIsAddingItem] = useState(() => localStorage.getItem('dashpro_is_adding_item') === 'true');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(() => {
      const saved = localStorage.getItem('dashpro_editing_item');
      return saved ? JSON.parse(saved) : null;
  });
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
  
  // Settings State
  const [settingsForm, setSettingsForm] = useState(() => {
      const saved = localStorage.getItem('dashpro_settings_draft');
      if (saved) return JSON.parse(saved);
      return {
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
      };
  });
  const [isFormDirty, setIsFormDirty] = useState(!!localStorage.getItem('dashpro_settings_draft'));
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

  // Verification State
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [registryNumber, setRegistryNumber] = useState(restaurant.verificationDocs?.registryNumber || '');
  const [isSubmittingVerification, setIsSubmittingVerification] = useState(false);

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
              const uploaded = await uploadImage(idCardFile, 'documents'); // Assuming 'documents' bucket or just use 'images'
              if (uploaded) idCardUrl = uploaded;
              else throw new Error("Erreur upload ID Card");
          }

          const payload = {
              verification_status: 'pending',
              verification_docs: {
                  idCardUrl,
                  registryNumber
              }
          };

          const { error } = await supabase.from('restaurants').update(payload).eq('id', restaurant.id);
          if (error) throw error;

          onUpdateRestaurant({ 
              ...restaurant, 
              verificationStatus: 'pending',
              verificationDocs: { idCardUrl, registryNumber }
          });
          toast.success("Documents envoyés ! Passez à l'étape 2 : Paiement.");
      } catch (err: any) {
          console.error("Verification Error:", err);
          toast.error("Erreur lors de l'envoi des documents.");
      } finally {
          setIsSubmittingVerification(false);
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
          // Mock success for demo
          onUpdateRestaurant({ ...restaurant, verificationPaymentStatus: 'paid' });
          toast.info("Paiement signalé (Mode Démo) !");
      } finally {
          setIsSubmittingVerification(false);
      }
  };

  // Time editing state
  const [prepTime, setPrepTime] = useState(restaurant.preparationTime?.toString() || '');
  const [deliveryTime, setDeliveryTime] = useState(restaurant.estimatedDeliveryTime?.toString() || '');

  // New Item State
  const [newItemName, setNewItemName] = useState(() => localStorage.getItem('dashpro_new_item_name') || '');
  const [newItemDesc, setNewItemDesc] = useState(() => localStorage.getItem('dashpro_new_item_desc') || '');
  const [newItemPrice, setNewItemPrice] = useState(() => localStorage.getItem('dashpro_new_item_price') || '');
  const [newItemStock, setNewItemStock] = useState(() => localStorage.getItem('dashpro_new_item_stock') || '');
  const [newItemCategory, setNewItemCategory] = useState<MenuItem['category']>(() => (localStorage.getItem('dashpro_new_item_category') as MenuItem['category']) || 'plat');
  const [newItemImageFile, setNewItemImageFile] = useState<File | null>(null);

  // Persistence for New Item Form
  useEffect(() => {
      localStorage.setItem('dashpro_is_adding_item', isAddingItem.toString());
      localStorage.setItem('dashpro_editing_item', JSON.stringify(editingItem));
      localStorage.setItem('dashpro_new_item_name', newItemName);
      localStorage.setItem('dashpro_new_item_desc', newItemDesc);
      localStorage.setItem('dashpro_new_item_price', newItemPrice);
      localStorage.setItem('dashpro_new_item_stock', newItemStock);
      localStorage.setItem('dashpro_new_item_category', newItemCategory);
  }, [isAddingItem, editingItem, newItemName, newItemDesc, newItemPrice, newItemStock, newItemCategory]);

  const clearNewItemForm = () => {
      setNewItemName('');
      setNewItemDesc('');
      setNewItemPrice('');
      setNewItemStock('');
      setNewItemCategory('plat');
      setEditingItem(null);
      setIsAddingItem(false);
      localStorage.removeItem('dashpro_is_adding_item');
      localStorage.removeItem('dashpro_editing_item');
      localStorage.removeItem('dashpro_new_item_name');
      localStorage.removeItem('dashpro_new_item_desc');
      localStorage.removeItem('dashpro_new_item_price');
      localStorage.removeItem('dashpro_new_item_stock');
      localStorage.removeItem('dashpro_new_item_category');
  };

  // Chat State
  
  // UI States
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

  // Load orders and promotions
  useEffect(() => {
    // Request notification permission on mount
    requestNotificationPermission();

    fetchRestaurantOrders();
    fetchPromotions();
    
    // Subscribe to REALTIME orders
    const channel = supabase
      .channel('orders-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT and UPDATE
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurant.id}`,
        },
        (payload) => {
          console.log("Mise à jour commande reçue:", payload);
          // On recharge tout pour avoir les relations (infos client)
          fetchRestaurantOrders();
          
          if (payload.eventType === 'INSERT') {
             // Play notification sound
             const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
             audio.play().catch(e => console.log("Audio play failed", e));
             setShowNotification(true);
             setTimeout(() => setShowNotification(false), 8000);
             
             // Send system push notification
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
  }, [restaurant.id]); // Re-run if restaurant ID changes

  // Sync settings form if restaurant prop changes, but ONLY if form is not dirty (unsaved changes)
  useEffect(() => {
      if (!isFormDirty) {
          setSettingsForm({
              name: restaurant.name,
              description: restaurant.description,
              coverImage: restaurant.coverImage,
              city: restaurant.city,
              latitude: restaurant.latitude,
              longitude: restaurant.longitude,
              phoneNumber: restaurant.phoneNumber || '',
              currency: restaurant.currency || 'USD',
              paymentConfig: restaurant.paymentConfig || {
                  acceptCash: true,
                  acceptMobileMoney: false
              }
          });
      }
  }, [restaurant, isFormDirty]);

  // Persist draft to localStorage whenever it changes
  useEffect(() => {
      if (isFormDirty) {
          localStorage.setItem('dashpro_settings_draft', JSON.stringify(settingsForm));
      }
  }, [settingsForm, isFormDirty]);

  // UPLOAD HELPER FUNCTION
  const uploadImage = async (file: File, bucket: string = 'images'): Promise<string | null> => {
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
          const filePath = `${fileName}`;

          const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);

          if (uploadError) {
              console.error("Upload error:", uploadError);
              if (uploadError.message.includes("row-level security policy")) {
                  toast.error("ERREUR PERMISSION (403): Veuillez exécuter le fichier 'fix_storage_error.sql' dans votre éditeur SQL Supabase pour autoriser l'upload.");
              } else {
                  toast.error(`Erreur upload image: ${uploadError.message}`);
              }
              return null;
          }

          const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
          return data.publicUrl;
      } catch (error) {
          console.error("Upload exception:", error);
          return null;
      }
  };

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
      console.warn("Promotions fetch error (likely 403 in demo)", err);
    }
  };

  const fetchRestaurantOrders = async () => {
    try {
        // 1. Fetch orders first without the join that might fail
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
        
        // Merge with local orders
        const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
        if (localOrdersStr) {
            try {
                const localOrders = JSON.parse(localOrdersStr);
                // Only add local orders that belong to this restaurant
                const restaurantLocalOrders = localOrders.filter((o: any) => o.restaurant_id === restaurant.id);
                allOrders = [...restaurantLocalOrders, ...allOrders];
            } catch (e) {
                console.error("Error parsing local orders", e);
            }
        }

        if (allOrders.length >= 0) {
            // 2. Extract unique user IDs
            const userIds = Array.from(new Set(allOrders.map((o: any) => o.user_id))).filter(Boolean);
            const validUserIds = userIds.filter((id: any) => typeof id === 'string' && id.length === 36);
            
            // 3. Fetch profiles for these users
            let profilesMap: Record<string, any> = {};
            if (validUserIds.length > 0) {
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('*')
                    .in('id', validUserIds);
                
                if (profilesError) {
                    console.error("Error fetching profiles:", profilesError);
                }
                
                if (profilesData) {
                    profilesData.forEach((p: any) => {
                        profilesMap[p.id] = p;
                    });
                }
            }

            // 4. Map data
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
            
            // Sort by created_at descending
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
            // Update local storage
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
            // Optimistic update
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            
            // Deduct stock if order is completed
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
                            
                            // Update database
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
        // Validation du type
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

        // Validation de la taille (ex: max 10MB pour les images, 50MB pour les vidéos)
        const maxSize = newPromoType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (promoFile.size > maxSize) {
            setPromoError(`Fichier trop volumineux. Maximum ${newPromoType === 'video' ? '50MB' : '10MB'}.`);
            setLoading(false);
            return;
        }

        const uploaded = await uploadImage(promoFile);
        if (uploaded) {
            urlToUse = uploaded;
        } else {
            setPromoError("Échec du téléchargement du média vers le serveur. Vérifiez votre connexion ou les permissions de stockage.");
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
          const uploadedUrl = await uploadImage(coverImageFile);
          if (uploadedUrl) {
              imageUrl = uploadedUrl;
          }
      }

      const updatePayload: any = {
          name: settingsForm.name,
          description: settingsForm.description,
          cover_image: imageUrl, // Mapping explicite vers la colonne snake_case
          city: settingsForm.city,
          latitude: settingsForm.latitude,
          longitude: settingsForm.longitude,
          phone_number: settingsForm.phoneNumber, // Mapping explicite vers la colonne snake_case
          currency: settingsForm.currency,
          payment_config: settingsForm.paymentConfig
      };

      try {
          console.log("Saving settings with payload:", updatePayload);
          const { error } = await supabase.from('restaurants')
            .update(updatePayload)
            .eq('id', restaurant.id);

          if(error) {
              if (error.code === '42703') {
                  // Fallback if currency or payment_config columns don't exist yet
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
          
          // Mise à jour de l'état local immédiatement pour reflet UI
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
          setIsFormDirty(false);
          localStorage.removeItem('dashpro_settings_draft');
          toast.success("✅ Paramètres enregistrés avec succès !");
      } catch (err: any) {
          console.error("Error Saving Settings:", err);
          toast.error(`Erreur de sauvegarde: ${err.message || 'Problème de connexion'}`);
          // On tente quand même de mettre à jour localement si c'est le mode démo/offline
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
          // Optimistic update fallback
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
    
    try {
        let imageUrl = editingItem ? editingItem.image : `https://picsum.photos/200/200?random=${Date.now()}`;
        
        if (newItemImageFile) {
            const uploadedUrl = await uploadImage(newItemImageFile);
            if (uploadedUrl) {
                imageUrl = uploadedUrl;
            } else {
                toast.error("Échec du téléchargement de l'image. Le plat sera ajouté avec une image par défaut.");
            }
        }

        const payload = {
            name: newItemName,
            description: newItemDesc,
            price: price,
            stock: stock,
            category: newItemCategory,
            image: imageUrl
        };

        if (editingItem) {
            // UPDATE
            const { error } = await supabase.from('menu_items').update(payload).eq('id', editingItem.id);
            if (error) throw error;
            
            const updatedMenu = restaurant.menu.map(m => m.id === editingItem.id ? { ...m, ...payload } : m);
            onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
            toast.success("Plat mis à jour avec succès !");
        } else {
            // CREATE
            const newPayload = { ...payload, restaurant_id: restaurant.id, is_available: true };
            const { data, error } = await supabase.from('menu_items').insert(newPayload).select().single();
            if (error) throw error;
            
            if (data) {
                const newItem: MenuItem = {
                  id: data.id, name: data.name, description: data.description, price: data.price,
                  stock: data.stock,
                  category: data.category as any, isAvailable: data.is_available, image: data.image
                };
                onUpdateRestaurant({ ...restaurant, menu: [...restaurant.menu, newItem] });
                toast.success("Plat ajouté au menu !");
            }
        }
        clearNewItemForm();
    } catch (err: any) {
      console.error("Error saving item:", err);
      toast.error(`Erreur lors de la sauvegarde : ${err.message || 'Problème de connexion'}`);

      // Fallback for demo/offline
      if (editingItem) {
          const updatedMenu = restaurant.menu.map(m => m.id === editingItem.id ? { 
              ...m, name: newItemName, description: newItemDesc, price, stock, category: newItemCategory 
          } : m);
          onUpdateRestaurant({ ...restaurant, menu: updatedMenu });
      } else {
          const mockItem: MenuItem = {
              id: `mock-item-${Date.now()}`, name: newItemName, description: newItemDesc, price: price,
              stock: stock,
              category: newItemCategory, isAvailable: true, image: `https://picsum.photos/200/200?random=${Date.now()}`
          };
          onUpdateRestaurant({ ...restaurant, menu: [...restaurant.menu, mockItem] });
      }
      // Don't clear form on error so user can retry
    } finally {
      setLoading(false);
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

  // Calculate daily and monthly revenue
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

  // Calculate product sales
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

  const renderSidebarItem = (view: DashboardView, icon: React.ReactNode, label: string, badge?: number) => (
      <button 
        onClick={() => navigateTo(view)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium ${activeView === view ? 'bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-400 font-bold shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'}`}
      >
          <div className="flex items-center space-x-3">
              {icon}
              <span>{label}</span>
          </div>
          {badge && badge > 0 ? (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse shadow-sm shadow-red-200">
                  {badge}
              </span>
          ) : null}
      </button>
  );

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
                    <label className="cursor-pointer bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-bold flex items-center">
                        <Upload size={16} className="mr-2"/>
                        {newItemImageFile ? 'Photo sélectionnée' : 'Choisir une photo'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setNewItemImageFile(e.target.files?.[0] || null)} />
                    </label>
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
              onClick={() => clearNewItemForm()}
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
                    <span className={`text-xs font-bold px-2 py-1 rounded-full mt-1 w-fit ${item.stock > 10 ? 'bg-green-100 text-green-700' : item.stock > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                      Stock: {item.stock}
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

  const saveAdvancedSettings = async (updates: any) => {
      const newSettings = {
          privacyProfile,
          privacyStories,
          notifPush,
          notifEmail,
          notifSms,
          twoFactorEnabled,
          ...updates
      };

      try {
          const { error } = await supabase
            .from('restaurants')
            .update({ settings: newSettings })
            .eq('id', restaurant.id);
          
          if (error) throw error;
          
          onUpdateRestaurant({ ...restaurant, settings: newSettings });
      } catch (err) {
          console.error("Error saving advanced settings:", err);
      }
  };

  const renderSettings = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <h2 className="text-2xl font-black text-gray-800 dark:text-white">Paramètres</h2>
      
      {/* GLOBAL APP SETTINGS */}
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

      {/* CONFIDENTIALITÉ & SÉCURITÉ (FACEBOOK STYLE) */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center text-lg">
                  <Shield size={24} className="mr-2 text-blue-600"/>
                  Confidentialité et Sécurité
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gérez qui peut voir votre contenu et sécurisez votre compte.</p>
          </div>
          
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {/* Privacy Section */}
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

                  <div className="flex items-center justify-between">
                      <div>
                          <p className="font-bold text-gray-900 dark:text-white">Audience des Stories</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Qui peut voir vos promotions éphémères ?</p>
                      </div>
                      <select 
                          value={privacyStories}
                          onChange={(e) => {
                              const val = e.target.value as any;
                              setPrivacyStories(val);
                              saveAdvancedSettings({ privacyStories: val });
                          }}
                          className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
                      >
                          <option value="everyone">Tout le monde (Public)</option>
                          <option value="followers">Abonnés uniquement</option>
                      </select>
                  </div>
              </div>

              {/* Notifications Section */}
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
                                  toast.error("Permission refusée ou non supportée par votre appareil.");
                              }
                          }}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${notifPush ? 'bg-green-500 text-white' : 'bg-brand-50 text-brand-600 border border-brand-200 hover:bg-brand-100'}`}
                      >
                          {notifPush ? 'Activé' : 'Activer'}
                      </button>
                  </div>

                  <div className="flex items-center justify-between">
                      <div>
                          <p className="font-bold text-gray-900 dark:text-white">Emails récapitulatifs</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Recevoir un bilan quotidien des ventes.</p>
                      </div>
                      <button 
                        onClick={() => {
                            const val = !notifEmail;
                            setNotifEmail(val);
                            saveAdvancedSettings({ notifEmail: val });
                        }} 
                        className={`w-12 h-6 rounded-full p-1 transition-colors ${notifEmail ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${notifEmail ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                  </div>
              </div>

              {/* Security Section */}
              <div className="p-6 space-y-6">
                  <h4 className="font-bold text-gray-800 dark:text-white text-sm uppercase tracking-wider mb-4 flex items-center">
                      <Lock size={16} className="mr-2"/> Sécurité Avancée
                  </h4>
                  
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
                  value={user.name}
                  onChange={(e) => onUpdateUser({ ...user, name: e.target.value })}
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
                      // The state is already updated via onChange
                            } catch (err) {
                                toast.error("Erreur lors de la mise à jour du nom.");
                            }
                        }}
                        className="bg-brand-600 text-white px-4 rounded-xl font-bold hover:bg-brand-700"
                    >
                  Sauvegarder
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

      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl">
        <h3 className="font-bold text-gray-800 dark:text-white mb-6 border-b pb-2 dark:border-gray-700">Configuration du Restaurant</h3>
        <form onSubmit={saveSettings} className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Nom de l'établissement</label>
            <input
              type="text"
              className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              value={settingsForm.name}
              onChange={e => {
                  setSettingsForm({ ...settingsForm, name: e.target.value });
                  setIsFormDirty(true);
              }}
            />
          </div>

           <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Numéro de téléphone (Public)</label>
            <input
              type="tel"
              className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
              placeholder="+243..."
              value={settingsForm.phoneNumber}
              onChange={e => {
                  setSettingsForm({ ...settingsForm, phoneNumber: e.target.value });
                  setIsFormDirty(true);
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Description</label>
            <textarea
              className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all h-32"
              value={settingsForm.description}
              onChange={e => {
                  setSettingsForm({ ...settingsForm, description: e.target.value });
                  setIsFormDirty(true);
              }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Ville</label>
              <input
                type="text"
                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={settingsForm.city}
                onChange={e => {
                    setSettingsForm({ ...settingsForm, city: e.target.value });
                    setIsFormDirty(true);
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Devise d'affichage</label>
              <select
                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={settingsForm.currency}
                onChange={e => {
                    setSettingsForm({ ...settingsForm, currency: e.target.value as 'USD' | 'CDF' });
                    setIsFormDirty(true);
                }}
              >
                <option value="USD">Dollar Américain ($)</option>
                <option value="CDF">Franc Congolais (FC)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Photo de profil / Couverture</label>
              <div className="space-y-2">
                  <input
                    type="text"
                    className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none"
                    value={settingsForm.coverImage}
                    onChange={e => {
                        setSettingsForm({ ...settingsForm, coverImage: e.target.value });
                        setIsFormDirty(true);
                    }}
                    placeholder="URL ou Upload"
                  />
                   <label className="cursor-pointer bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg font-bold flex items-center justify-center border border-gray-300 dark:border-gray-600">
                        <Upload size={16} className="mr-2"/>
                        {coverImageFile ? 'Image sélectionnée' : 'Uploader une image'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            setCoverImageFile(e.target.files?.[0] || null);
                            setIsFormDirty(true);
                        }} />
                    </label>
              </div>
            </div>

          {/* Payment Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <MapPin size={16} className="mr-2 text-brand-600"/> Latitude
              </label>
              <input
                type="number"
                step="0.000001"
                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={settingsForm.latitude}
                onChange={e => setSettingsForm({ ...settingsForm, latitude: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <MapPin size={16} className="mr-2 text-brand-600"/> Longitude
              </label>
              <input
                type="number"
                step="0.000001"
                className="w-full p-4 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-xl focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                value={settingsForm.longitude}
                onChange={e => setSettingsForm({ ...settingsForm, longitude: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        setSettingsForm({
                            ...settingsForm,
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        });
                    }, (err) => {
                        toast.error("Erreur de géolocalisation: " + err.message);
                    });
                } else {
                    toast.error("La géolocalisation n'est pas supportée par votre navigateur.");
                }
            }}
            className="w-full py-3 px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-sm flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <MapPin size={18} className="mr-2"/> Utiliser ma position actuelle
          </button>

          <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
            <h4 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
              <DollarSign size={18} className="mr-2 text-brand-600"/> Modes de Paiement Acceptés
            </h4>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Cash à la livraison</p>
                  <p className="text-xs text-gray-500">Le client paie lors de la réception.</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setSettingsForm({
                    ...settingsForm, 
                    paymentConfig: { ...settingsForm.paymentConfig, acceptCash: !settingsForm.paymentConfig.acceptCash }
                  })}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${settingsForm.paymentConfig.acceptCash ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${settingsForm.paymentConfig.acceptCash ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">Paiement Mobile Money</p>
                  <p className="text-xs text-gray-500">Le client paie directement sur le site.</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setSettingsForm({
                    ...settingsForm, 
                    paymentConfig: { ...settingsForm.paymentConfig, acceptMobileMoney: !settingsForm.paymentConfig.acceptMobileMoney }
                  })}
                  className={`w-12 h-6 rounded-full p-1 transition-colors ${settingsForm.paymentConfig.acceptMobileMoney ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${settingsForm.paymentConfig.acceptMobileMoney ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {settingsForm.paymentConfig.acceptMobileMoney && (
                <div className="pl-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Numéro M-Pesa</label>
                    <input 
                      type="tel"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
                      placeholder="Ex: 081..."
                      value={settingsForm.paymentConfig.mpesaNumber || ''}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        paymentConfig: { ...settingsForm.paymentConfig, mpesaNumber: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Numéro Airtel Money</label>
                    <input 
                      type="tel"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
                      placeholder="Ex: 099..."
                      value={settingsForm.paymentConfig.airtelNumber || ''}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        paymentConfig: { ...settingsForm.paymentConfig, airtelNumber: e.target.value }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Numéro Orange Money</label>
                    <input 
                      type="tel"
                      className="w-full p-3 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg text-sm"
                      placeholder="Ex: 089..."
                      value={settingsForm.paymentConfig.orangeNumber || ''}
                      onChange={e => setSettingsForm({
                        ...settingsForm,
                        paymentConfig: { ...settingsForm.paymentConfig, orangeNumber: e.target.value }
                      })}
                    />
                  </div>
                </div>
              )}
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

      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 max-w-2xl mt-6">
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

                {/* Step 1 */}
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
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">Photo Carte d'Identité / Passeport</label>
                            <input 
                                type="file" 
                                accept="image/*"
                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                onChange={e => setIdCardFile(e.target.files?.[0] || null)}
                                disabled={restaurant.verificationStatus === 'pending'}
                            />
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

                {/* Step 2 */}
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
    </div>
  );

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

  const renderSalesAndInventory = () => (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <h2 className="text-2xl font-black text-gray-800 dark:text-white">Ventes & Inventaire</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Sales Overview */}
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

        {/* Inventory Overview */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center">
            <Package size={20} className="mr-2 text-brand-600"/> Alertes Stock
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {restaurant.menu.filter(item => item.stock !== undefined).sort((a, b) => (a.stock || 0) - (b.stock || 0)).map(item => (
              <div key={item.id} className={`flex flex-col p-3 rounded-xl border ${item.stock! <= 5 ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-700 border-transparent'}`}>
                <div className="flex justify-between items-center">
                    <div>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-200 block">{item.name}</span>
                        {item.stock! <= 5 && <span className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center mt-1"><AlertCircle size={12} className="mr-1"/> Stock Faible</span>}
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className={`text-sm font-black px-3 py-1 rounded-full ${item.stock! > 10 ? 'bg-green-100 text-green-700' : item.stock! > 0 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
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
            ))}
            {restaurant.menu.filter(item => item.stock !== undefined).length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Aucun article avec suivi de stock.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );

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
                                            setNewPromoUrl(''); // Clear URL if file selected
                                            setPromoError(null);
                                        }
                                    }} 
                                />
                            </label>
                        </div>

                        {/* PREVIEW SECTION */}
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
                                    setPromoFile(null); // Clear file if URL typed
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
            currentUser={{ id: user.id, role: 'business' }}
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
          {activeView === 'settings' && renderSettings()}
      </main>

    </div>
  );
};