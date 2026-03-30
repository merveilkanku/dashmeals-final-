import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  MapPin, ShoppingBag, List, Map, ArrowLeft, Plus, Bike, Footprints, 
  LogOut, Navigation, Search, X, Receipt, Phone, Info, Image as ImageIcon, 
  PlayCircle, Settings, Moon, Sun, Globe, CheckCircle, CheckCircle2, Star, Type, Clock, Bell, ChevronRight,
  Shield, Lock, Fingerprint, Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { KINSHASA_CENTER_LAT, KINSHASA_CENTER_LNG, CITIES_RDC, APP_LOGO_URL } from '../constants';
import { Restaurant, UserState, ViewMode, MenuItem, CartItem, User, Order, Promotion, Theme, Language, AppFont, PaymentMethod, MobileMoneyNetwork, SecuritySettings } from '../types';
import { calculateTime, getDistanceFromLatLonInKm, formatDistance, formatTime } from '../utils/geo';
import { RestaurantCard } from './RestaurantCard';
import { MapView } from './MapView';
import { CartDrawer } from './CartDrawer';
import { ChatWindow } from './ChatWindow';
import { StoryViewer } from './StoryViewer';
import { OrdersView } from './OrdersView';
import { useTranslation } from '../lib/i18n';
import { PinSetupDialog } from './PinSetupDialog';
import { requestNotificationPermission, sendPushNotification } from '../utils/notifications';
import { Geolocation } from '@capacitor/geolocation';

// Speed constants
const SPEED_WALKING = 5;
const SPEED_MOTO = 30;

interface Props {
  user: User;
  allRestaurants: Restaurant[];
  onLogout: () => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  language: Language;
  setLanguage: (l: Language) => void;
  font?: AppFont;
  setFont?: (f: AppFont) => void;
  onUpdateUser?: (user: User) => void;
}

export const CustomerView: React.FC<Props> = ({ user, allRestaurants, onLogout, theme, setTheme, language, setLanguage, font, setFont, onUpdateUser }) => {
  const t = useTranslation(language);
  // State
  const [userState, setUserState] = useState<UserState>({
    location: null,
    locationError: null,
    loadingLocation: true,
  });
  
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [promotionsMap, setPromotionsMap] = useState<Record<string, Promotion[]>>({});
  
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [urgentMode, setUrgentMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [selectedCity, setSelectedCity] = useState<string>('Toutes');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous');
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('Tous');
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [openNow, setOpenNow] = useState<boolean>(false);
  const [detectedAddress, setDetectedAddress] = useState<string | null>(null);
  
  const [isSearchingUrgent, setIsSearchingUrgent] = useState(false);
  const [urgentRestaurant, setUrgentRestaurant] = useState<Restaurant | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Order States
  const [orders, setOrders] = useState<Order[]>([]);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  
  // Chat State
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);

  // Story State
  const [activeStoryRestaurant, setActiveStoryRestaurant] = useState<Restaurant | null>(null);
  const [storyStartIndex, setStoryStartIndex] = useState(0);

  // Subscription State
  const [subscribedRestaurants, setSubscribedRestaurants] = useState<string[]>([]);
  const [isSubscribing, setIsSubscribing] = useState<string | null>(null);

  const [isPinSetupOpen, setIsPinSetupOpen] = useState(false);

  // Reset menu category when switching restaurants
  useEffect(() => {
    setSelectedMenuCategory('Tous');
  }, [selectedRestaurant]);

  // Fetch subscriptions
  useEffect(() => {
    if (user && user.role !== 'guest') {
      const fetchSubscriptions = async () => {
        const { data, error } = await supabase
          .from('followers')
          .select('restaurant_id')
          .eq('user_id', user.id);
        
        if (!error && data) {
          setSubscribedRestaurants(data.map(f => f.restaurant_id));
        }
      };
      fetchSubscriptions();
    }
  }, [user]);

  const toggleSubscription = async (restaurantId: string) => {
    if (user.role === 'guest') {
      toast.error("Vous devez d'abord vous connecter pour vous abonner.");
      return;
    }

    setIsSubscribing(restaurantId);
    const isSubscribed = subscribedRestaurants.includes(restaurantId);

    try {
      if (isSubscribed) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('user_id', user.id)
          .eq('restaurant_id', restaurantId);
        
        if (error) throw error;
        setSubscribedRestaurants(prev => prev.filter(id => id !== restaurantId));
        toast.info("Abonnement annulé.");
      } else {
        const { error } = await supabase
          .from('followers')
          .insert({ user_id: user.id, restaurant_id: restaurantId });
        
        if (error) throw error;
        setSubscribedRestaurants(prev => [...prev, restaurantId]);
        toast.success("Vous êtes maintenant abonné à ce restaurant !");
      }
    } catch (error) {
      console.error("Erreur abonnement:", error);
      toast.error("Une erreur est survenue lors de l'abonnement.");
    } finally {
      setIsSubscribing(null);
    }
  };

  const updateSecuritySettings = async (newSettings: Partial<SecuritySettings>) => {
    if (!user || user.role === 'guest' || !onUpdateUser) return;

    const updatedSettings = {
      ...(user.settings || {
        notifPush: true,
        notifEmail: true,
        notifSms: false,
        twoFactorEnabled: false,
        appLockEnabled: false,
        appLockPin: null,
        biometricsEnabled: false
      }),
      ...newSettings
    };

    const updatedUser = {
      ...user,
      settings: updatedSettings
    };

    onUpdateUser(updatedUser);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ settings: updatedSettings })
        .eq('id', user.id);

      if (error) throw error;
      toast.success("Paramètres de sécurité mis à jour");
    } catch (err) {
      console.error("Error updating security settings:", err);
      toast.error("Erreur lors de la mise à jour des paramètres");
    }
  };

  const handleSetPin = (pin: string) => {
    updateSecuritySettings({ appLockPin: pin, appLockEnabled: true });
    setIsPinSetupOpen(false);
    toast.success("Code PIN configuré avec succès !");
  };

  // Carousel Ref
  const carouselRef = useRef<HTMLDivElement>(null);

  // Auto-scroll carousel
  useEffect(() => {
      const carousel = carouselRef.current;
      if (!carousel) return;

      let scrollInterval: NodeJS.Timeout;
      const startScroll = () => {
          scrollInterval = setInterval(() => {
              if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth - 10) {
                  carousel.scrollTo({ left: 0, behavior: 'smooth' });
              } else {
                  carousel.scrollBy({ left: carousel.clientWidth, behavior: 'smooth' });
              }
          }, 5000); // Scroll every 5 seconds
      };

      startScroll();

      // Pause on hover/touch
      const pauseScroll = () => clearInterval(scrollInterval);
      carousel.addEventListener('mouseenter', pauseScroll);
      carousel.addEventListener('mouseleave', startScroll);
      carousel.addEventListener('touchstart', pauseScroll);
      carousel.addEventListener('touchend', startScroll);

      return () => {
          clearInterval(scrollInterval);
          carousel.removeEventListener('mouseenter', pauseScroll);
          carousel.removeEventListener('mouseleave', startScroll);
          carousel.removeEventListener('touchstart', pauseScroll);
          carousel.removeEventListener('touchend', startScroll);
      };
  }, []);

  // History Management
  useEffect(() => {
      // Initial state
      if (!window.history.state) {
          window.history.replaceState({ view: 'list' }, '', '#list');
      }

      const onPopState = (e: PopStateEvent) => {
          const state = e.state;
          if (state?.view) {
              setViewMode(state.view);
              if (state.view === 'list' || state.view === 'map') {
                  setSelectedRestaurant(null);
              }
          }
          
          setIsCartOpen(!!state?.cart);
          if (!state?.chat) setActiveChatOrder(null);
          if (!state?.story) setActiveStoryRestaurant(null);
          if (!state?.urgent) {
              setUrgentMode(false);
              setUrgentRestaurant(null);
          }
      };

      window.addEventListener('popstate', onPopState);
      return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = (mode: ViewMode) => {
      if (mode === viewMode) return;
      window.history.pushState({ view: mode }, '', `#${mode}`);
      setViewMode(mode);
  };

  const openCart = () => {
      window.history.pushState({ view: viewMode, cart: true }, '', '#cart');
      setIsCartOpen(true);
  };

  const closeCart = () => {
      if (window.history.state?.cart) window.history.back();
      else setIsCartOpen(false);
  };

  const openChat = (order: Order) => {
      window.history.pushState({ view: viewMode, chat: true }, '', '#chat');
      setActiveChatOrder(order);
  };

  const closeChat = () => {
      if (window.history.state?.chat) window.history.back();
      else setActiveChatOrder(null);
  };

  const openStory = (restaurant: Restaurant, index: number) => {
      window.history.pushState({ view: viewMode, story: true }, '', '#story');
      setStoryStartIndex(index);
      setActiveStoryRestaurant(restaurant);
  };

  const closeStory = () => {
      if (window.history.state?.story) window.history.back();
      else setActiveStoryRestaurant(null);
  };

  const toggleUrgentMode = () => {
      if (!urgentMode) {
          window.history.pushState({ view: viewMode, urgent: true }, '', '#urgent');
          setUrgentMode(true);
      } else {
          if (window.history.state?.urgent) window.history.back();
          else setUrgentMode(false);
      }
  };

  // Geolocation Function
  const refreshLocation = async () => {
    setUserState(prev => ({ ...prev, loadingLocation: true, locationError: null }));
    
    try {
        const isApp = window.location.protocol === 'capacitor:';

        if (isApp) {
            // Request permissions if needed
            const permissions = await Geolocation.requestPermissions();
            if (permissions.location !== 'granted') {
                throw new Error("Permission de localisation refusée");
            }

            const position = await Geolocation.getCurrentPosition({
                enableHighAccuracy: true,
                timeout: 10000
            });

            setUserState({
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                },
                locationError: null,
                loadingLocation: false
            });
        } else {
            // Standard Web Geolocation
            if (!navigator.geolocation) {
                throw new Error("La géolocalisation n'est pas supportée");
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setUserState({
                        location: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                        },
                        locationError: null,
                        loadingLocation: false
                    });
                },
                (error) => {
                    console.warn("Geo error:", error);
                    fallbackLocation();
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        }
    } catch (err: any) {
        console.error("Location error:", err);
        fallbackLocation(err.message);
    }
  };

  const fallbackLocation = (msg?: string) => {
      // Fallback to IP geolocation if GPS fails
      fetch('https://ipapi.co/json/')
      .then(res => res.json())
      .then(data => {
        if (data.latitude && data.longitude) {
          setUserState({
            location: {
              latitude: data.latitude,
              longitude: data.longitude
            },
            locationError: msg || "Position GPS introuvable. Utilisation de la position réseau.",
            loadingLocation: false
          });
        } else {
          throw new Error("IP Geo failed");
        }
      })
      .catch(err => {
        setUserState({
            location: {
                latitude: KINSHASA_CENTER_LAT,
                longitude: KINSHASA_CENTER_LNG
            },
            locationError: "Position introuvable. Utilisation de la position par défaut (Kinshasa).",
            loadingLocation: false
        });
      });
  };

  // Initial Geolocation
  useEffect(() => {
    refreshLocation();
  }, []);

  // Update Restaurants when location or database changes
  useEffect(() => {
    if (userState.location) {
      // Reverse Geocoding to get city
      if (!userState.locationError) {
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userState.location.latitude}&lon=${userState.location.longitude}`)
          .then(res => res.json())
          .then(data => {
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.state;
            if (city) {
              setDetectedAddress(city);
              const matchedCity = CITIES_RDC.find(c => city.toLowerCase().includes(c.toLowerCase()));
              if (matchedCity) {
                // We don't auto-select the city anymore to avoid hiding restaurants
                // that might be in a specific municipality (e.g., Gombe instead of Kinshasa).
                // The user can manually select the city if they want.
              }
            }
          })
          .catch(err => console.error("Reverse geocoding failed", err));
      }

      const updatedRestaurants = allRestaurants.map(r => {
        const dist = getDistanceFromLatLonInKm(
          userState.location!.latitude,
          userState.location!.longitude,
          r.latitude,
          r.longitude
        );
        return {
          ...r,
          distance: dist,
          timeWalking: calculateTime(dist, SPEED_WALKING),
          timeMoto: calculateTime(dist, SPEED_MOTO),
        };
      }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

      setRestaurants(updatedRestaurants);
      // Fetch promotions after restaurants are ready
      fetchPromotions(updatedRestaurants);
    } else {
      setRestaurants(allRestaurants);
      fetchPromotions(allRestaurants);
    }
  }, [userState.location, allRestaurants]);

  // Realtime Orders Subscription for Customer
  useEffect(() => {
    // Request notification permission on mount
    requestNotificationPermission();

    const channel = supabase
        .channel('customer-orders')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE', // On écoute quand le restaurant change le statut
                schema: 'public',
                table: 'orders',
                filter: `user_id=eq.${user.id}`
            },
            (payload) => {
                console.log("Mise à jour commande client:", payload);
                // On met à jour l'état local pour voir le changement instantanément
                setOrders(prev => prev.map(o => 
                    o.id === payload.new.id ? { ...o, status: payload.new.status } : o
                ));
                
                // Send push notification
                const statusMap: Record<string, string> = {
                    'preparing': 'Votre commande est en cours de préparation 🍳',
                    'ready': 'Votre commande est prête ! 🛍️',
                    'delivering': 'Votre commande est en route 🛵',
                    'completed': 'Commande livrée. Bon appétit ! 😋',
                    'cancelled': 'Votre commande a été annulée ❌'
                };
                
                const message = statusMap[payload.new.status] || `Le statut de votre commande a changé : ${payload.new.status}`;
                
                sendPushNotification("Mise à jour de commande", {
                    body: message,
                    tag: `order-${payload.new.id}`,
                    requireInteraction: true
                });
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
  }, [user.id]);

  const fetchPromotions = async (restos: Restaurant[]) => {
      // Filter for last 24 hours
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 24);

      let { data, error } = await supabase
        .from('promotions')
        .select('*')
        .gte('created_at', yesterday.toISOString())
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error && error.code === '42703') {
          // Fallback if is_active column doesn't exist yet
          const fallback = await supabase
            .from('promotions')
            .select('*')
            .gte('created_at', yesterday.toISOString())
            .order('created_at', { ascending: false });
          data = fallback.data;
      }

      if (data) {
          const mapping: Record<string, Promotion[]> = {};
          data.forEach((p: any) => {
              if (!mapping[p.restaurant_id]) mapping[p.restaurant_id] = [];
              mapping[p.restaurant_id].push({
                  id: p.id,
                  restaurantId: p.restaurant_id,
                  mediaUrl: p.media_url,
                  mediaType: p.media_type,
                  caption: p.caption,
                  createdAt: p.created_at
              });
          });
          setPromotionsMap(mapping);
      }
  };

  // Load Orders when entering 'orders' view
  useEffect(() => {
    if (viewMode === 'orders') {
        fetchOrders();
    }
  }, [viewMode]);

  const fetchOrders = async () => {
    try {
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (ordersError) {
             console.warn("Fetch orders failed:", ordersError.message);
             const localOrdersStr = localStorage.getItem('dashmeals_mock_orders');
             if (localOrdersStr) {
                 const localOrders = JSON.parse(localOrdersStr);
                 const userLocalOrders = localOrders.filter((o: any) => o.user_id === user.id);
                 if (userLocalOrders.length > 0) {
                     setOrders(userLocalOrders.map((o: any) => ({
                         id: o.id,
                         userId: o.user_id,
                         restaurantId: o.restaurant_id,
                         status: o.status,
                         totalAmount: o.total_amount,
                         isUrgent: o.items && o.items.length > 0 ? o.items[0].isUrgent : false,
                         items: o.items,
                         createdAt: o.created_at,
                         restaurant: { 
                             name: restaurants.find(r => r.id === o.restaurant_id)?.name || 'Restaurant Local',
                             phone_number: restaurants.find(r => r.id === o.restaurant_id)?.phoneNumber || ''
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
                // Only add local orders that belong to this user
                const userLocalOrders = localOrders.filter((o: any) => o.user_id === user.id);
                allOrders = [...userLocalOrders, ...allOrders];
            } catch (e) {
                console.error("Error parsing local orders", e);
            }
        }

        if (allOrders.length >= 0) {
            // Extract unique restaurant IDs
            const restaurantIds = Array.from(new Set(allOrders.map((o: any) => o.restaurant_id))).filter(Boolean);
            const validRestaurantIds = restaurantIds.filter((id: any) => typeof id === 'string' && id.length === 36);
            
            // Fetch restaurants
            let restaurantsMap: Record<string, any> = {};
            if (validRestaurantIds.length > 0) {
                const { data: restaurantsData, error: restaurantsError } = await supabase
                    .from('restaurants')
                    .select('id, name, phone_number')
                    .in('id', validRestaurantIds);
                
                if (restaurantsError) {
                    console.error("Error fetching restaurants:", restaurantsError);
                }
                
                if (restaurantsData) {
                    restaurantsData.forEach((r: any) => {
                        restaurantsMap[r.id] = r;
                    });
                }
            }

            // Also check allRestaurants prop for fallback
            allRestaurants.forEach(r => {
                if (!restaurantsMap[r.id]) {
                    restaurantsMap[r.id] = r;
                }
            });

            const formattedOrders = allOrders.map((o: any) => ({
                id: o.id,
                userId: o.user_id,
                restaurantId: o.restaurant_id,
                status: o.status,
                totalAmount: o.total_amount,
                isUrgent: o.items && o.items.length > 0 ? o.items[0].isUrgent : false,
                paymentMethod: o.items && o.items.length > 0 ? o.items[0].paymentMethod : 'cash',
                paymentNetwork: o.items && o.items.length > 0 ? o.items[0].paymentNetwork : undefined,
                paymentStatus: o.items && o.items.length > 0 ? o.items[0].paymentStatus : 'pending',
                items: o.items,
                createdAt: o.created_at,
                restaurant: {
                    name: restaurantsMap[o.restaurant_id]?.name || 'Inconnu',
                    phone_number: restaurantsMap[o.restaurant_id]?.phone_number
                }
            }));
            
            // Sort by created_at descending
            formattedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setOrders(formattedOrders);
        }
    } catch (err) {
        console.error("Error fetching orders:", err);
    }
  };

  const handleUrgentMode = async () => {
    if (urgentMode) {
      setUrgentMode(false);
      setUrgentRestaurant(null);
      return;
    }

    setUrgentMode(true);
    setIsSearchingUrgent(true);

    // Simulate searching for nearby restaurants
    setTimeout(() => {
      // Find the closest open restaurant with quick prep time
      const closest = restaurants
        .filter(r => r.isOpen && r.preparationTime <= 20)
        .sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))[0];

      setIsSearchingUrgent(false);
      
      if (closest) {
        setUrgentRestaurant(closest);
        setSelectedRestaurant(closest);
        // Don't navigate yet, show the "Found" overlay instead
      } else {
        toast.info("Aucun restaurant rapide trouvé à proximité !");
        setUrgentMode(false);
      }
    }, 2000);
  };

  // Filter Logic (City + Urgent + Search + Category + Sort + OpenNow)
  const filteredRestaurants = useMemo(() => {
    let list = restaurants;
    if (selectedCity && selectedCity !== 'Toutes') {
        const normalizedSelectedCity = selectedCity.toLowerCase().trim();
        list = list.filter(r => r.city && r.city.toLowerCase().trim() === normalizedSelectedCity);
    }
    if (selectedCategory && selectedCategory !== 'Tous') {
        const normalizedCategory = selectedCategory.toLowerCase().trim();
        list = list.filter(r => r.type && r.type.toLowerCase().trim() === normalizedCategory);
    }
    if (urgentMode) list = list.filter(r => r.isOpen && r.preparationTime <= 20);
    if (openNow) list = list.filter(r => r.isOpen);
    
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        list = list.filter(r => 
          (r.name && r.name.toLowerCase().includes(query)) || 
          (r.description && r.description.toLowerCase().includes(query))
        );
    }

    // Sorting
    if (sortBy === 'rating') {
        list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortBy === 'distance') {
        list = [...list].sort((a, b) => (a.distance || 0) - (b.distance || 0));
    } else if (sortBy === 'time') {
        list = [...list].sort((a, b) => (a.estimatedDeliveryTime || 0) - (b.estimatedDeliveryTime || 0));
    }

    return list;
  }, [restaurants, urgentMode, selectedCity, searchQuery, selectedCategory, sortBy, openNow]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, urgentMode, searchQuery, restaurants, selectedCategory, sortBy, openNow]);

  const paginatedRestaurants = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      return filteredRestaurants.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRestaurants, currentPage]);

  const totalPages = Math.ceil(filteredRestaurants.length / itemsPerPage);

  // Cart Logic
  const addToCart = (item: MenuItem, restaurant: Restaurant) => {
    if (cart.length > 0 && cart[0].restaurantId !== restaurant.id) {
        if(!window.confirm("Vous ne pouvez commander que dans un restaurant à la fois. Vider le panier actuel ?")) return;
        setCart([]);
    }
    setCart(prev => {
        const existing = prev.find(i => i.id === item.id);
        if (existing) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, { ...item, quantity: 1, restaurantId: restaurant.id, restaurantName: restaurant.name }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart(prev => {
        const index = prev.findIndex(i => i.id === itemId);
        if (index > -1) {
            const newArr = [...prev];
            newArr.splice(index, 1);
            return newArr;
        }
        return prev;
    });
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    setCart(prev => prev.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    ));
  };

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleCheckout = async (paymentMethod: PaymentMethod, network?: MobileMoneyNetwork, isUrgent?: boolean, paymentProof?: string, deliveryLocation?: { lat: number; lng: number; address: string }) => {
    if (user.role === 'guest') {
        toast.error("Veuillez vous connecter ou créer un compte pour commander.");
        onLogout(); // Redirect to login
        return;
    }
    if (cart.length === 0) return;
    setIsCheckingOut(true);

    // Add isUrgent flag, payment info, and customer info to the first item as a workaround for schema limitations
    const itemsWithUrgent = cart.map((item, index) => 
        index === 0 ? { 
            ...item, 
            isUrgent: isUrgent || false,
            paymentMethod: paymentMethod,
            paymentNetwork: network,
            paymentStatus: paymentMethod === 'cash' ? 'pending' : 'paid',
            paymentProof: paymentProof,
            customerName: user.name,
            customerPhone: user.phoneNumber,
            deliveryLocation: deliveryLocation
        } : item
    );

    try {
        const { data, error } = await supabase.from('orders').insert({
            user_id: user.id,
            restaurant_id: cart[0].restaurantId,
            status: 'pending',
            total_amount: cartTotal,
            items: itemsWithUrgent // Supabase will stringify this automatically for jsonb
        }).select().single();

        if (error) {
            console.warn("Erreur Supabase, sauvegarde locale:", error);
            const localOrders = JSON.parse(localStorage.getItem('dashmeals_mock_orders') || '[]');
            const newOrder = {
                id: 'mock-' + Date.now(),
                user_id: user.id,
                restaurant_id: cart[0].restaurantId,
                status: 'pending',
                total_amount: cartTotal,
                items: itemsWithUrgent,
                created_at: new Date().toISOString()
            };
            localOrders.push(newOrder);
            localStorage.setItem('dashmeals_mock_orders', JSON.stringify(localOrders));
        }

        // Success Path
        closeCart();
        setShowSuccess(true);
        setCart([]);
        
        // Redirection rapide vers l'historique pour voir le suivi
        setTimeout(() => {
             setShowSuccess(false);
             setViewMode('orders');
             // fetchOrders sera appelé par le useEffect du viewMode
        }, 2000);

    } catch (err: any) {
        toast.error(err.message || "Erreur inconnue lors de la commande.");
    } finally {
        setIsCheckingOut(false);
    }
  };

  // Views
  if (userState.loadingLocation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-50 dark:bg-gray-900">
        <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-brand-800 dark:text-brand-400 font-medium">Localisation en cours...</p>
      </div>
    );
  }

  // Get list of restaurants that have promotions
  const restaurantsWithStories = restaurants.filter(r => promotionsMap[r.id] && promotionsMap[r.id].length > 0 && !r.isVerified);
  
  // Get list of verified restaurants (Network Ads)
  const verifiedNetworkAds = allRestaurants.filter(r => r.isVerified);

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto bg-gray-50 dark:bg-gray-900 shadow-2xl overflow-hidden relative transition-colors duration-300">
      
      {/* STORY VIEWER OVERLAY */}
      {activeStoryRestaurant && promotionsMap[activeStoryRestaurant.id] && (
          <StoryViewer 
            key={`${activeStoryRestaurant.id}-${storyStartIndex}`}
            restaurant={activeStoryRestaurant}
            promotions={promotionsMap[activeStoryRestaurant.id]}
            onClose={closeStory}
            onVisitRestaurant={() => {
                closeStory();
                setSelectedRestaurant(activeStoryRestaurant);
                setViewMode('restaurant_detail');
            }}
            initialIndex={storyStartIndex}
          />
      )}

      {/* CHAT OVERLAY */}
      {activeChatOrder && (
          <ChatWindow 
            orderId={activeChatOrder.id}
            currentUser={{ id: user.id, role: 'client' }}
            otherUserName={activeChatOrder.restaurant?.name || 'Restaurant'}
            otherUserPhone={activeChatOrder.restaurant?.phone_number || '+243999999999'}
            onClose={closeChat}
          />
      )}

      {/* SUCCESS OVERLAY */}
      {showSuccess && (
        <div className="absolute inset-0 z-[60] bg-brand-500 flex flex-col items-center justify-center text-white p-6 text-center animate-fade-in">
           <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-xl">
              <ShoppingBag className="text-brand-500" size={40} />
           </div>
           <h2 className="text-3xl font-bold mb-2">Commande Reçue !</h2>
           <p className="text-brand-100">Votre repas est en préparation.</p>
           <div className="mt-8 bg-white/20 p-4 rounded-xl backdrop-blur-sm">
             <p className="font-mono text-sm">Redirection vers le suivi...</p>
           </div>
        </div>
      )}

      {/* URGENT MODE OVERLAY */}
      {isSearchingUrgent && (
        <div className="absolute inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center text-white p-6 text-center backdrop-blur-sm">
           <div className="w-24 h-24 rounded-full border-4 border-red-500 border-t-transparent animate-spin mb-6"></div>
           <h2 className="text-2xl font-black mb-2 animate-pulse">Recherche Express...</h2>
           <p className="text-gray-300">Nous cherchons le restaurant le plus rapide autour de vous !</p>
        </div>
      )}

      {urgentRestaurant && urgentMode && (
         <div className="absolute inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl border-2 border-red-500 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 animate-pulse"></div>
                
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Zap size={40} className="text-red-600 fill-red-600 animate-bounce" />
                </div>
                
                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-1">Trouvé !</h2>
                <h3 className="text-xl font-bold text-brand-600 mb-4">{urgentRestaurant.name}</h3>
                
                <div className="flex justify-center space-x-4 mb-6 text-sm">
                    <span className="flex items-center text-gray-600 dark:text-gray-300 font-bold bg-gray-100 dark:bg-gray-700 px-3 py-1 rounded-lg">
                        <Navigation size={14} className="mr-1"/> {formatDistance(urgentRestaurant.distance || 0)}
                    </span>
                    <span className="flex items-center text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-3 py-1 rounded-lg">
                        <Clock size={14} className="mr-1"/> ~{urgentRestaurant.preparationTime} min
                    </span>
                </div>

                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                    Ce restaurant est ouvert et peut préparer votre commande rapidement. Voulez-vous voir le menu ?
                </p>

                <div className="space-y-3">
                    <button 
                        onClick={() => {
                            setUrgentRestaurant(null);
                            navigateTo('restaurant_detail');
                        }}
                        className="w-full bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-lg shadow-red-500/30 transition-transform active:scale-95"
                    >
                        COMMANDER MAINTENANT ⚡
                    </button>
                    <button 
                        onClick={() => {
                            setUrgentMode(false);
                            setUrgentRestaurant(null);
                        }}
                        className="w-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold py-3 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        Annuler
                    </button>
                </div>
            </div>
         </div>
      )}

      {/* HEADER */}
      <header className="bg-white dark:bg-gray-800 sticky top-0 z-30 px-4 py-3 shadow-sm border-b border-gray-100 dark:border-gray-700 transition-colors duration-300">
        <div className="flex justify-between items-center mb-2">
            <div className="flex flex-col">
                <div className="flex items-center">
                   <div className="bg-white p-1 rounded-lg mr-2 shadow-sm border border-gray-100 dark:border-gray-700">
                      <img src={APP_LOGO_URL} alt="DashMeals" className="h-8 w-auto object-contain" />
                   </div>
                   <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight mr-2">DashMeals</h1>
                   <span className="text-[10px] bg-brand-100 dark:bg-brand-900 text-brand-800 dark:text-brand-300 px-2 py-0.5 rounded-full font-bold border border-brand-200 dark:border-brand-800">RDC</span>
                </div>
                {/* Affichage du nom du client */}
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium ml-9">Bonjour, {user.name}</span>
            </div>
          <div className="flex items-center space-x-2">
            <button onClick={openCart} className="relative p-2 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                <ShoppingBag size={20} className="text-gray-700 dark:text-gray-200" />
                {cart.length > 0 && <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full border-2 border-white dark:border-gray-800">{cart.length}</span>}
            </button>
            <button onClick={() => navigateTo('settings')} className="p-2 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400">
                <Settings size={20} />
            </button>
          </div>
        </div>
        
        {(viewMode === 'list' || viewMode === 'map') && (
            <div className="flex items-center space-x-2">
                <div className="flex-1 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded-lg truncate border border-gray-100 dark:border-gray-600">
                  <div className="flex items-center truncate">
                    <MapPin size={14} className={`mr-1.5 flex-shrink-0 ${userState.locationError ? 'text-gray-400' : 'text-brand-500 animate-pulse'}`} />
                    <span className="truncate font-medium text-xs">
                      {userState.loadingLocation ? "Localisation..." : userState.locationError ? "Position par défaut (Kinshasa)" : (detectedAddress || "Ma Position GPS")}
                    </span>
                  </div>
                  <button onClick={refreshLocation} className="ml-2 p-1 bg-white dark:bg-gray-600 rounded-full shadow-sm hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors" title="Actualiser ma position">
                    <Navigation size={12} className={`text-brand-600 dark:text-brand-400 ${userState.loadingLocation ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="relative">
                    <select className="bg-brand-50 dark:bg-gray-700 text-brand-700 dark:text-brand-400 text-xs font-bold py-2 pl-2 pr-6 rounded-lg border border-brand-200 dark:border-gray-600 outline-none appearance-none cursor-pointer hover:bg-brand-100 dark:hover:bg-gray-600 transition-colors" value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)}>
                    <option value="Toutes">Toutes les villes</option>
                    {CITIES_RDC.map(city => <option key={city} value={city}>{city}</option>)}
                    </select>
                    <ChevronRight className="absolute right-2 top-1/2 transform -translate-y-1/2 text-brand-500 pointer-events-none rotate-90" size={12} />
                </div>
            </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="p-4 pt-2">
        
        {viewMode === 'list' || viewMode === 'map' ? (
            <>
                {/* SEARCH BAR */}
                <div className="mb-4 relative z-20">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text"
                        placeholder="Rechercher un restaurant par nom..."
                        className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-brand-500 outline-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm transition-shadow focus:shadow-md"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')} 
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                      >
                        <X size={16} />
                      </button>
                    )}
                </div>

                {/* FILTERS & SORTING */}
                <div className="mb-6 flex flex-col space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Catégories</h3>
                        <div className="relative">
                            <select 
                                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs font-medium py-1.5 pl-8 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 outline-none appearance-none cursor-pointer shadow-sm focus:ring-2 focus:ring-brand-500"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                            >
                                <option value="relevance">Pertinence</option>
                                <option value="rating">Mieux notés</option>
                                <option value="distance">Plus proches</option>
                                <option value="time">Livraison rapide</option>
                            </select>
                            <List className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                            <ChevronRight className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none rotate-90" size={14} />
                        </div>
                    </div>
                    <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
                        <button
                            onClick={() => setOpenNow(!openNow)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border flex items-center ${
                                openNow 
                                ? 'bg-emerald-500 text-white border-emerald-500' 
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            <Clock size={14} className="mr-1.5" /> Ouvert
                        </button>
                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 my-auto mx-1"></div>
                        {['Tous', 'Restaurant', 'Snack', 'Bar', 'Terrasse'].map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border ${
                                    selectedCategory === cat 
                                    ? 'bg-brand-500 text-white border-brand-500' 
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* FEATURED RESTAURANTS CAROUSEL (Verified Restaurants) - Hidden during search */}
                {!searchQuery && verifiedNetworkAds.length > 0 && (
                    <div className="mb-8 relative">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight flex items-center">
                                <Star className="text-yellow-500 mr-1.5" size={18} fill="currentColor" />
                                Sélection Premium
                            </h2>
                            <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-1 rounded-md uppercase tracking-wider">Sponsorisé</span>
                        </div>
                        <div ref={carouselRef} className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar space-x-4 pb-4 -mx-4 px-4">
                            {verifiedNetworkAds.map(r => (
                                <div 
                                    key={r.id}
                                    onClick={() => { setSelectedRestaurant(r); navigateTo('restaurant_detail'); }}
                                    className="snap-center shrink-0 w-[90vw] sm:w-[500px] relative rounded-2xl overflow-hidden shadow-xl cursor-pointer group border border-gray-100 dark:border-gray-700"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent z-10"></div>
                                    <img src={r.coverImage} alt={r.name} className="w-full h-56 sm:h-64 object-cover group-hover:scale-105 transition-transform duration-700" />
                                    
                                    <div className="absolute top-4 left-4 z-20 flex gap-2">
                                        <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-lg flex items-center border border-white/20">
                                            <Star size={12} className="mr-1.5 fill-white" /> Premium
                                        </span>
                                        {subscribedRestaurants.includes(r.id) && (
                                            <span className="bg-brand-500/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-lg flex items-center border border-white/20">
                                                <Bell size={12} className="mr-1.5 fill-white" /> Abonné
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="absolute top-4 right-4 z-20">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSubscription(r.id);
                                            }}
                                            className={`p-2 rounded-full shadow-lg backdrop-blur-md border transition-colors ${
                                                subscribedRestaurants.includes(r.id)
                                                ? 'bg-white/20 border-white/30 text-white'
                                                : 'bg-white border-white text-brand-600 hover:bg-brand-50'
                                            }`}
                                        >
                                            <Bell size={18} className={subscribedRestaurants.includes(r.id) ? 'fill-white' : ''} />
                                        </button>
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-5 z-20">
                                        <h3 className="text-2xl font-black text-white mb-1.5 drop-shadow-lg">{r.name}</h3>
                                        <p className="text-gray-200 text-sm line-clamp-2 mb-4 drop-shadow-md">{r.description}</p>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-3 text-white/90 text-sm font-bold">
                                                <span className="flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10"><Star size={14} className="text-amber-400 fill-amber-400 mr-1.5" /> {r.rating}</span>
                                                <span className="flex items-center bg-black/40 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-white/10"><Clock size={14} className="mr-1.5" /> {r.estimatedDeliveryTime} min</span>
                                            </div>
                                            <button className="bg-brand-500 hover:bg-brand-600 text-white text-sm font-black px-5 py-2.5 rounded-xl shadow-lg transition-colors flex items-center">
                                                Commander <ChevronRight size={16} className="ml-1" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* STORIES BAR - Hidden during search */}
                {!searchQuery && restaurantsWithStories.length > 0 && (
                    <div className="mb-6 -mx-4 px-4 overflow-x-auto no-scrollbar">
                        <div className="flex space-x-4">
                            {restaurantsWithStories.map(r => (
                                <button 
                                    key={r.id} 
                                    onClick={() => {
                                        setStoryStartIndex(0);
                                        setActiveStoryRestaurant(r);
                                    }}
                                    className="flex flex-col items-center space-y-1 min-w-[64px]"
                                >
                                    <div className="w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr from-brand-500 to-yellow-500">
                                        <div className="w-full h-full rounded-full border-2 border-white dark:border-gray-800 overflow-hidden">
                                            <img src={r.coverImage} className="w-full h-full object-cover" alt={r.name} />
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300 truncate w-full text-center">{r.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* FILTERS */}
                <div className="flex space-x-3 mb-6 overflow-x-auto no-scrollbar pb-1">
                    <button 
                        onClick={handleUrgentMode}
                        className={`flex items-center px-4 py-2 rounded-full font-bold text-sm shadow-sm transition-all border whitespace-nowrap ${urgentMode ? 'bg-red-500 text-white border-red-500 animate-pulse-fast' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'}`}
                    >
                        <Zap size={16} className={`mr-1 ${urgentMode ? 'fill-white' : 'fill-none'}`} />
                        Urgent - J'ai faim !
                    </button>
                    <button className="px-4 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm whitespace-nowrap shadow-sm">🍖 Grillades</button>
                    <button className="px-4 py-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm whitespace-nowrap shadow-sm">🍗 Poulet</button>
                </div>

                {/* CONTENT */}
                {viewMode === 'list' ? (
                    <div className="space-y-4">
                        {paginatedRestaurants.map(restaurant => (
                            <RestaurantCard 
                                key={restaurant.id} 
                                restaurant={restaurant} 
                                onClick={() => { setSelectedRestaurant(restaurant); navigateTo('restaurant_detail'); }} 
                                promotionsCount={promotionsMap[restaurant.id]?.length || 0}
                                isSubscribed={subscribedRestaurants.includes(restaurant.id)}
                                onSubscribe={(e) => {
                                    e.stopPropagation();
                                    toggleSubscription(restaurant.id);
                                }}
                            />
                        ))}

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex justify-center items-center space-x-4 py-4">
                                <button 
                                    onClick={() => {
                                        setCurrentPage(p => Math.max(1, p - 1));
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Précédent
                                </button>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                    Page {currentPage} / {totalPages}
                                </span>
                                <button 
                                    onClick={() => {
                                        setCurrentPage(p => Math.min(totalPages, p + 1));
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === totalPages}
                                    className="px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 disabled:opacity-50 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Suivant
                                </button>
                            </div>
                        )}

                        {filteredRestaurants.length === 0 && (
                            <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                                <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Search size={24} className="text-gray-400" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Aucun résultat trouvé</h3>
                                <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                                    Nous n'avons trouvé aucun établissement correspondant à vos critères {selectedCity !== 'Toutes' ? `à ${selectedCity}` : ''} {searchQuery ? `pour "${searchQuery}"` : ''}.
                                </p>
                                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto">
                                            Effacer la recherche
                                        </button>
                                    )}
                                    {selectedCategory !== 'Tous' && (
                                        <button onClick={() => setSelectedCategory('Tous')} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors w-full sm:w-auto">
                                            Toutes les catégories
                                        </button>
                                    )}
                                    {urgentMode && (
                                        <button onClick={() => setUrgentMode(false)} className="px-4 py-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-lg font-medium hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors w-full sm:w-auto">
                                            Désactiver le mode urgent
                                        </button>
                                    )}
                                    {openNow && (
                                        <button onClick={() => setOpenNow(false)} className="px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors w-full sm:w-auto">
                                            Voir tous les établissements
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <MapView 
                        restaurants={filteredRestaurants} 
                        userLocation={userState.location} 
                        onSelect={(r) => { setSelectedRestaurant(r); navigateTo('restaurant_detail'); }}
                        onLocationChange={(loc) => setUserState(prev => ({ ...prev, location: loc, locationError: null }))}
                    />
                )}
            </>
        ) : viewMode === 'restaurant_detail' && selectedRestaurant ? (
            <div className="animate-in slide-in-from-right duration-300">
                <button onClick={() => window.history.back()} className="mb-4 flex items-center text-gray-600 dark:text-gray-300 font-medium hover:text-brand-600"><ArrowLeft size={18} className="mr-1" /> Retour</button>
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6">
                    <img src={selectedRestaurant.coverImage} className="w-full h-48 object-cover" alt="Cover" />
                    <div className="p-4">
                        <div className="flex justify-between items-start">
                           <div className="flex items-center flex-wrap gap-2">
                               <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{selectedRestaurant.name}</h1>
                               {selectedRestaurant.isVerified && (
                                   <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md shadow-sm flex items-center">
                                       <Star size={10} className="mr-1 fill-white" /> Premium
                                   </span>
                               )}
                           </div>
                           <div className="flex flex-col items-end space-y-1">
                               <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-lg font-medium">{selectedRestaurant.city}</span>
                               {selectedRestaurant.type && (
                                   <span className="text-[10px] bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">{selectedRestaurant.type}</span>
                               )}
                           </div>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 mb-4 mt-2">{selectedRestaurant.description}</p>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 mb-6">
                            <button 
                                onClick={() => toggleSubscription(selectedRestaurant.id)}
                                className={`flex-1 flex items-center justify-center px-4 py-3 rounded-xl text-sm font-black transition-all shadow-md ${
                                    subscribedRestaurants.includes(selectedRestaurant.id)
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
                                    : 'bg-gradient-to-r from-brand-500 to-brand-600 text-white hover:from-brand-600 hover:to-brand-700 animate-pulse'
                                }`}
                            >
                                <Bell size={20} className={`mr-2 ${subscribedRestaurants.includes(selectedRestaurant.id) ? 'fill-gray-400' : ''}`} />
                                {subscribedRestaurants.includes(selectedRestaurant.id) ? 'Abonné aux offres' : "S'abonner aux offres"}
                            </button>
                        </div>
                        
                        {/* Info & Contact Section */}
                        <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-xl mb-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3 flex items-center"><Info size={16} className="mr-2 text-brand-600"/> Informations & Contact</h3>
                            <div className="space-y-2">
                                <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                    <MapPin size={16} className="mr-2 text-gray-400"/>
                                    <span>{selectedRestaurant.city || 'Kinshasa'}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                                        <Phone size={16} className="mr-2 text-gray-400"/>
                                        <span>{selectedRestaurant.phoneNumber || 'Numéro non disponible'}</span>
                                    </div>
                                    {selectedRestaurant.phoneNumber && (
                                        <button 
                                            onClick={() => window.open(`tel:${selectedRestaurant.phoneNumber}`)}
                                            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center shadow-md transition-transform active:scale-95"
                                        >
                                            <Phone size={14} className="mr-1"/> Appeler
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                            <span className="flex items-center bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"><Navigation size={14} className="mr-1"/> {formatDistance(selectedRestaurant.distance || 0)}</span>
                            <span className="flex items-center bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded"><Zap size={14} className="mr-1 text-yellow-500"/> {selectedRestaurant.preparationTime} min</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-2">
                             <div className="flex items-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-orange-700 dark:text-orange-400 border border-orange-100 dark:border-orange-900/30">
                                <Bike size={20} className="mr-3" />
                                <div><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">En Moto</p><p className="font-bold text-lg leading-none">{selectedRestaurant.timeMoto ? formatTime(selectedRestaurant.timeMoto) : '--'}</p></div>
                            </div>
                            <div className="flex items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
                                <Footprints size={20} className="mr-3" />
                                <div><p className="text-[10px] font-bold uppercase tracking-wider opacity-70">À pied</p><p className="font-bold text-lg leading-none">{selectedRestaurant.timeWalking ? formatTime(selectedRestaurant.timeWalking) : '--'}</p></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* GALLERY SECTION */}
                {promotionsMap[selectedRestaurant.id] && promotionsMap[selectedRestaurant.id].length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-lg font-bold mb-3 text-gray-800 dark:text-white flex items-center">
                            <ImageIcon className="mr-2 text-brand-600" size={18} />
                            Galerie ({promotionsMap[selectedRestaurant.id].length})
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                            {promotionsMap[selectedRestaurant.id].map((item, idx) => (
                                <button
                                    key={item.id}
                                    onClick={() => openStory(selectedRestaurant, idx)}
                                    className="relative aspect-square rounded-xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 group"
                                >
                                    {item.mediaType === 'video' ? (
                                        <>
                                            <video src={item.mediaUrl} className="w-full h-full object-cover opacity-90" muted />
                                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                                                <PlayCircle className="text-white opacity-90" size={24} />
                                            </div>
                                        </>
                                    ) : (
                                        <img src={item.mediaUrl} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110" alt="Gallery" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Menu</h3>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {selectedRestaurant.menu.filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory).length} articles
                    </div>
                </div>

                {/* MENU CATEGORY FILTER */}
                <div className="flex space-x-2 overflow-x-auto no-scrollbar mb-4 -mx-4 px-4">
                    {['Tous', 'entrée', 'plat', 'dessert', 'boisson'].map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedMenuCategory(cat)}
                            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm border ${
                                selectedMenuCategory === cat 
                                ? 'bg-brand-500 text-white border-brand-500' 
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                            {cat === 'entrée' ? 'Entrées' : 
                             cat === 'plat' ? 'Plats' : 
                             cat === 'dessert' ? 'Desserts' : 
                             cat === 'boisson' ? 'Boissons' : 'Tout'}
                        </button>
                    ))}
                </div>

                <div className="space-y-3 pb-20">
                    {selectedRestaurant.menu.filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory).length === 0 && (
                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            <ShoppingBag className="mx-auto text-gray-300 dark:text-gray-600 mb-2" size={32} />
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Aucun article disponible dans cette catégorie.</p>
                        </div>
                    )}
                    {selectedRestaurant.menu
                        .filter(item => selectedMenuCategory === 'Tous' || item.category === selectedMenuCategory)
                        .map(item => (
                            <div key={item.id} className={`bg-white dark:bg-gray-800 p-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex space-x-3 ${!item.isAvailable ? 'opacity-60 grayscale' : ''}`}>
                            <img src={item.image} className="w-20 h-20 rounded-lg object-cover bg-gray-100 dark:bg-gray-700" alt={item.name} />
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-gray-800 dark:text-white">{item.name}</h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{item.description}</p>
                                </div>
                                <div className="flex justify-between items-end mt-2">
                                    <span className="font-bold text-brand-600">
                                        {selectedRestaurant.currency === 'CDF' ? `${(item.price || 0).toFixed(0)} FC` : `$${(item.price || 0).toFixed(2)}`}
                                    </span>
                                    {item.isAvailable ? (
                                        <div className="flex items-center space-x-2">
                                            {cart.find(c => c.id === item.id) && (
                                                <span className="text-xs font-bold bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 px-2 py-1 rounded-full">
                                                    x{cart.find(c => c.id === item.id)?.quantity}
                                                </span>
                                            )}
                                            <button onClick={() => addToCart(item, selectedRestaurant)} className="bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 p-2 rounded-full hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"><Plus size={16} /></button>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">Épuisé</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* STICKY CART SUMMARY */}
                {cart.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 z-50 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-2xl animate-slide-in-right max-w-md mx-auto">
                        <button 
                            onClick={openCart}
                            className="w-full bg-brand-600 text-white rounded-xl p-4 flex justify-between items-center shadow-lg hover:bg-brand-700 transition-colors"
                        >
                            <div className="flex items-center">
                                <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center mr-3 font-bold text-sm">
                                    {cart.reduce((acc, item) => acc + item.quantity, 0)}
                                </div>
                                <span className="font-bold">Voir le panier</span>
                            </div>
                            <span className="font-black text-lg">
                                {selectedRestaurant.currency === 'CDF' ? `${cartTotal.toFixed(0)} FC` : `$${cartTotal.toFixed(2)}`}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        ) : viewMode === 'orders' ? (
            <OrdersView 
                orders={orders} 
                onChat={openChat} 
                onBrowse={() => setViewMode('list')} 
                onOrderUpdated={fetchOrders}
            />
        ) : viewMode === 'settings' ? (
             <div className="animate-in slide-in-from-right duration-300">
                <button onClick={() => window.history.back()} className="mb-4 flex items-center text-gray-600 dark:text-gray-300 font-medium hover:text-brand-600"><ArrowLeft size={18} className="mr-1" /> {t('back_to_restaurants')}</button>
                <h2 className="text-2xl font-black text-gray-800 dark:text-white mb-6">{t('settings')}</h2>
                
                <div className="space-y-6">
                    {/* Theme Toggle */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                            {theme === 'light' ? <Sun size={20} className="mr-2 text-orange-500"/> : <Moon size={20} className="mr-2 text-blue-400"/>}
                            {t('appearance')}
                        </h3>
                        <div className="flex space-x-2">
                            <button 
                                onClick={() => setTheme('light')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm border ${theme === 'light' ? 'bg-orange-50 border-orange-500 text-orange-700' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                            >
                                {t('light')}
                            </button>
                            <button 
                                onClick={() => setTheme('dark')}
                                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-500 text-blue-400' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                            >
                                {t('dark')}
                            </button>
                        </div>
                    </div>

                    {/* Language Toggle */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                            <Globe size={20} className="mr-2 text-brand-600"/>
                            {t('language')}
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                             {(['fr', 'en', 'ln'] as const).map((lang) => (
                                <button
                                    key={lang} 
                                    onClick={() => setLanguage(lang)}
                                    className={`w-full text-left py-3 px-4 rounded-lg font-bold text-sm border flex justify-between items-center ${language === lang ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500 text-brand-700 dark:text-brand-400' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                                >
                                    <span>{lang === 'fr' ? 'Français' : lang === 'en' ? 'English' : 'Lingala'}</span>
                                    {language === lang && <div className="w-2 h-2 rounded-full bg-brand-500"></div>}
                                </button>
                             ))}
                        </div>
                    </div>

                    {/* Security Settings */}
                    {user.role !== 'guest' && (
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                                <Shield size={20} className="mr-2 text-brand-600"/>
                                Sécurité & Accès
                            </h3>
                            
                            <div className="space-y-4">
                                {/* App Lock */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                                            <Lock size={18} className="text-gray-600 dark:text-gray-300" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">Verrouillage de l'application</p>
                                            <p className="text-[10px] text-gray-500">Demander un PIN à l'ouverture</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => user.settings?.appLockEnabled ? updateSecuritySettings({ appLockEnabled: false }) : setIsPinSetupOpen(true)}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.appLockEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.appLockEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {/* Biometrics */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                                            <Fingerprint size={18} className="text-gray-600 dark:text-gray-300" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">Biométrie (Face ID / Empreinte)</p>
                                            <p className="text-[10px] text-gray-500">Utiliser les capteurs du téléphone</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ biometricsEnabled: !user.settings?.biometricsEnabled })}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.biometricsEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.biometricsEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                {/* 2FA */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center">
                                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                                            <Zap size={18} className="text-gray-600 dark:text-gray-300" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">Double Authentification (2FA)</p>
                                            <p className="text-[10px] text-gray-500">Sécurité renforcée lors de la connexion</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ twoFactorEnabled: !user.settings?.twoFactorEnabled })}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.twoFactorEnabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.twoFactorEnabled ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications Settings */}
                    {user.role !== 'guest' && (
                        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                            <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                                <Bell size={20} className="mr-2 text-brand-600"/>
                                Notifications
                            </h3>
                            
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">Notifications Push</p>
                                        <p className="text-[10px] text-gray-500">Alertes en temps réel sur votre écran</p>
                                    </div>
                                    <button 
                                        onClick={async () => {
                                            if (!user.settings?.notifPush) {
                                                const granted = await requestNotificationPermission();
                                                if (granted) {
                                                    updateSecuritySettings({ notifPush: true });
                                                    sendPushNotification("Notifications activées", { body: "Vous recevrez désormais des alertes en temps réel." });
                                                } else {
                                                    const isInIframe = window.self !== window.top;
                                                    if (isInIframe) {
                                                        toast.error("Les notifications sont bloquées dans l'aperçu. Veuillez ouvrir l'application dans un nouvel onglet pour les activer.");
                                                    } else {
                                                        toast.error("Permission refusée ou non supportée.");
                                                    }
                                                }
                                            } else {
                                                updateSecuritySettings({ notifPush: false });
                                            }
                                        }}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.notifPush ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.notifPush ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">Emails</p>
                                        <p className="text-[10px] text-gray-500">Récapitulatifs et factures par mail</p>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ notifEmail: !user.settings?.notifEmail })}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.notifEmail ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.notifEmail ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-gray-900 dark:text-white">SMS</p>
                                        <p className="text-[10px] text-gray-500">Alertes par message texte</p>
                                    </div>
                                    <button 
                                        onClick={() => updateSecuritySettings({ notifSms: !user.settings?.notifSms })}
                                        className={`w-12 h-6 rounded-full transition-colors relative ${user.settings?.notifSms ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${user.settings?.notifSms ? 'right-1' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Notifications */}
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center">
                            <Bell size={20} className="mr-2 text-brand-600"/>
                            Notifications Push
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Recevez une alerte quand le statut de votre commande change.</p>
                        <button 
                            onClick={async () => {
                                const granted = await requestNotificationPermission();
                                if (granted) {
                                    toast.success("Notifications activées avec succès !");
                                    sendPushNotification("Test de notification", { body: "Les notifications fonctionnent correctement." });
                                } else {
                                    toast.error("Permission refusée ou non supportée par votre appareil.");
                                }
                            }}
                            className="w-full bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/20 dark:hover:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold py-3 px-4 rounded-lg text-sm transition-colors"
                        >
                            Activer les notifications
                        </button>
                    </div>

                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 text-red-500 p-2 rounded-lg font-bold">
                            <LogOut size={20}/>
                            <span>{t('logout')}</span>
                        </button>
                    </div>
                </div>
            </div>
        ) : null}
      </main>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-around items-center z-40 max-w-md mx-auto transition-colors duration-300">
        <button onClick={() => navigateTo('list')} className={`flex flex-col items-center space-y-1 ${viewMode === 'list' || viewMode === 'restaurant_detail' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><List size={22} /><span className="text-[10px] font-medium">Liste</span></button>
        <div className="relative -top-6"><button onClick={toggleUrgentMode} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-gray-50 dark:border-gray-900 transition-all ${urgentMode ? 'bg-red-500 text-white scale-110' : 'bg-brand-500 text-white'}`}><Zap size={24} className={urgentMode ? 'animate-pulse' : ''} /></button></div>
        <button onClick={() => navigateTo('map')} className={`flex flex-col items-center space-y-1 ${viewMode === 'map' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><Map size={22} /><span className="text-[10px] font-medium">Carte</span></button>
        <button onClick={() => navigateTo('orders')} className={`flex flex-col items-center space-y-1 ${viewMode === 'orders' ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'}`}><Receipt size={22} /><span className="text-[10px] font-medium">{t('orders')}</span></button>
      </nav>

      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={closeCart} 
        items={cart} 
        onRemove={removeFromCart} 
        onUpdateQuantity={updateQuantity}
        onCheckout={handleCheckout} 
        total={cartTotal} 
        isLoading={isCheckingOut} 
        currency={restaurants.find(r => r.id === cart[0]?.restaurantId)?.currency} 
        paymentConfig={restaurants.find(r => r.id === cart[0]?.restaurantId)?.paymentConfig}
      />

      {/* PIN Setup Dialog */}
      <PinSetupDialog 
        isOpen={isPinSetupOpen}
        onClose={() => setIsPinSetupOpen(false)}
        onConfirm={handleSetPin}
      />
    </div>
  );
};