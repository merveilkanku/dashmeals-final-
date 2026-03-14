import React, { useState } from 'react';
import { X, Trash2, ShoppingBag, CreditCard, Banknote, ArrowLeft, Phone, CheckCircle2, Smartphone } from 'lucide-react';
import { CartItem, RestaurantPaymentConfig, PaymentMethod, MobileMoneyNetwork } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  onRemove: (id: string) => void;
  onCheckout: (paymentMethod: PaymentMethod, network?: MobileMoneyNetwork, isUrgent?: boolean) => void;
  total: number;
  currency?: 'USD' | 'CDF';
  isLoading?: boolean;
  paymentConfig?: RestaurantPaymentConfig;
}

export const CartDrawer: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  items, 
  onRemove, 
  onCheckout, 
  total, 
  currency = 'USD', 
  isLoading = false,
  paymentConfig = { acceptCash: true, acceptMobileMoney: false, airtelNumber: '', orangeNumber: '', mpesaNumber: '' }
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<MobileMoneyNetwork | null>(null);
  const [isUrgent, setIsUrgent] = useState(false);

  const formatPrice = (amount: number) => {
      if (currency === 'CDF') return `${amount.toFixed(0)} FC`;
      return `$${amount.toFixed(2)}`;
  };

  const handleNextStep = () => {
    if (step === 1) {
      setStep(2);
    } else {
      if (!selectedMethod) return;
      if (selectedMethod === 'mobile_money' && !selectedNetwork) return;
      onCheckout(selectedMethod, selectedNetwork || undefined, isUrgent);
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setSelectedMethod(null);
    setSelectedNetwork(null);
    setIsUrgent(false);
    onClose();
  };

  if (!isOpen) return null;

  const canProceed = step === 1 ? items.length > 0 : (selectedMethod === 'cash' || (selectedMethod === 'mobile_money' && selectedNetwork));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={resetAndClose}></div>
      
      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-slide-in-right">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex items-center">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="mr-3 p-1 hover:bg-gray-200 rounded-full">
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 className="text-xl font-bold flex items-center">
              {step === 1 ? (
                <>
                  <ShoppingBag className="mr-2 text-brand-600" />
                  Votre Panier
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 text-brand-600" />
                  Paiement
                </>
              )}
            </h2>
          </div>
          <button onClick={resetAndClose} className="p-2 hover:bg-gray-200 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {step === 1 ? (
            items.length === 0 ? (
              <div className="text-center text-gray-500 mt-10">
                <p>Votre panier est vide.</p>
                <button onClick={resetAndClose} className="mt-4 text-brand-600 font-medium">Retourner aux restaurants</button>
              </div>
            ) : (
              items.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex justify-between items-center bg-white border rounded-lg p-3 shadow-sm">
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800">{item.name}</h4>
                    <p className="text-xs text-gray-500">{item.restaurantName}</p>
                    <p className="text-brand-600 font-bold mt-1">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                      <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">x{item.quantity}</span>
                      <button onClick={() => onRemove(item.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-full">
                          <Trash2 size={18} />
                      </button>
                  </div>
                </div>
              ))
            )
          ) : (
            <div className="space-y-6">
              
              {/* Urgent Mode Toggle */}
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-red-700 flex items-center">
                    <span className="mr-2">🚀</span> Mode Urgent
                  </p>
                  <p className="text-xs text-red-600 mt-1">Prioriser cette commande pour une livraison plus rapide.</p>
                </div>
                <button
                  onClick={() => setIsUrgent(!isUrgent)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${isUrgent ? 'bg-red-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${isUrgent ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
              </div>

              <div>
                <p className="text-sm font-bold text-gray-500 uppercase mb-3">Choisissez votre mode de paiement</p>
                <div className="grid grid-cols-1 gap-3">
                  {paymentConfig.acceptCash && (
                    <button 
                      onClick={() => setSelectedMethod('cash')}
                      className={`flex items-center p-4 border-2 rounded-xl transition-all ${selectedMethod === 'cash' ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${selectedMethod === 'cash' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Banknote size={24} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">Cash à la livraison</p>
                        <p className="text-xs text-gray-500">Payez en espèces lors de la réception</p>
                      </div>
                      {selectedMethod === 'cash' && <CheckCircle2 className="ml-auto text-brand-600" size={20} />}
                    </button>
                  )}

                  {paymentConfig.acceptMobileMoney && (
                    <button 
                      onClick={() => setSelectedMethod('mobile_money')}
                      className={`flex items-center p-4 border-2 rounded-xl transition-all ${selectedMethod === 'mobile_money' ? 'border-brand-500 bg-brand-50' : 'border-gray-100 hover:border-gray-200'}`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${selectedMethod === 'mobile_money' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        <Smartphone size={24} />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">Paiement en ligne</p>
                        <p className="text-xs text-gray-500">Airtel, Orange ou M-Pesa</p>
                      </div>
                      {selectedMethod === 'mobile_money' && <CheckCircle2 className="ml-auto text-brand-600" size={20} />}
                    </button>
                  )}
                </div>
              </div>

              {selectedMethod === 'mobile_money' && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                  <p className="text-sm font-bold text-gray-500 uppercase mb-3">Sélectionnez votre réseau</p>
                  <div className="grid grid-cols-3 gap-2">
                    {paymentConfig.mpesaNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('mpesa')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'mpesa' ? 'border-brand-500 bg-brand-50' : 'border-gray-100'}`}
                      >
                        <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-xs mb-2 shadow-sm">M-PESA</div>
                        <span className="text-[10px] font-bold">M-Pesa</span>
                      </button>
                    )}
                    {paymentConfig.airtelNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('airtel')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'airtel' ? 'border-brand-500 bg-brand-50' : 'border-gray-100'}`}
                      >
                        <div className="w-12 h-12 bg-red-500 rounded-lg flex items-center justify-center text-white font-black text-xs mb-2 shadow-sm">AIRTEL</div>
                        <span className="text-[10px] font-bold">Airtel</span>
                      </button>
                    )}
                    {paymentConfig.orangeNumber && (
                      <button 
                        onClick={() => setSelectedNetwork('orange')}
                        className={`flex flex-col items-center p-3 border-2 rounded-xl transition-all ${selectedNetwork === 'orange' ? 'border-brand-500 bg-brand-50' : 'border-gray-100'}`}
                      >
                        <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center text-white font-black text-xs mb-2 shadow-sm">ORANGE</div>
                        <span className="text-[10px] font-bold">Orange</span>
                      </button>
                    )}
                  </div>

                  {selectedNetwork && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-2">Instructions de paiement</p>
                      <p className="text-sm text-gray-700 mb-4">
                        Veuillez envoyer <span className="font-bold text-brand-700">{formatPrice(total)}</span> au numéro suivant :
                      </p>
                      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm mb-4">
                        <div className="flex items-center">
                          <Phone size={16} className="text-brand-600 mr-2" />
                          <span className="font-mono font-bold text-lg">
                            {selectedNetwork === 'mpesa' ? paymentConfig.mpesaNumber : 
                             selectedNetwork === 'airtel' ? paymentConfig.airtelNumber : 
                             paymentConfig.orangeNumber}
                          </span>
                        </div>
                        <button 
                          onClick={() => {
                            const num = selectedNetwork === 'mpesa' ? paymentConfig.mpesaNumber : 
                                       selectedNetwork === 'airtel' ? paymentConfig.airtelNumber : 
                                       paymentConfig.orangeNumber;
                            if (num) navigator.clipboard.writeText(num);
                          }}
                          className="text-xs font-bold text-brand-600 hover:underline"
                        >
                          Copier
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 italic">
                        Une fois le transfert effectué, cliquez sur le bouton ci-dessous pour confirmer votre commande.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-4 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-600">Total</span>
              <span className="text-2xl font-bold text-brand-700">{formatPrice(total)}</span>
            </div>
            
            <button 
              onClick={handleNextStep}
              disabled={isLoading || !canProceed}
              className={`w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl shadow-lg transform active:scale-95 transition-all flex justify-center items-center ${isLoading || !canProceed ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                step === 1 ? 'Passer à la commande' : 'Confirmer le paiement'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
