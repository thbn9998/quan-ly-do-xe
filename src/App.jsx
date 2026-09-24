import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
import { Car, Upload, MousePointer2, Settings, FastForward, Plus, Trash2, RotateCw, AlertTriangle, Info, Edit2 } from 'lucide-react';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'parking-manager-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { projectId: "demo-project" };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const MS_PER_HOUR = 60 * 60 * 1000;
const WARNING_THRESHOLD = 4 * MS_PER_HOUR; // Cảnh báo khi còn dưới 4 tiếng

const SLOT_TYPES = {
    red: { label: 'Xe Công xa', colorClass: 'red', fields: 'name' },
    green: { label: 'Xe PDI', colorClass: 'green', fields: 'details', limitHours: 72 },
    orange: { label: 'Xe PDI (ngắn hạn)', colorClass: 'orange', fields: 'details', limitHours: 24 },
    blue: { label: 'Xe Khách hàng', colorClass: 'blue', fields: 'name' }
};

const formatRemainingTime = (remainingMs) => {
    if (remainingMs <= 0) return "QUÁ HẠN";
    const h = Math.floor(remainingMs / MS_PER_HOUR);
    const m = Math.floor((remainingMs % MS_PER_HOUR) / 60000);
    return `Còn ${h}h ${m}m`;
};

const getSlotStyle = (type, isOccupied) => {
    const styles = {
        red: { border: 'border-red-500', bg: 'bg-red-100', emptyBg: 'bg-red-50', text: 'text-red-700' },
        blue: { border: 'border-blue-500', bg: 'bg-blue-100', emptyBg: 'bg-blue-50', text: 'text-blue-700' },
        green: { border: 'border-green-500', bg: 'bg-green-100', emptyBg: 'bg-green-50', text: 'text-green-700' },
        orange: { border: 'border-orange-500', bg: 'bg-orange-100', emptyBg: 'bg-orange-50', text: 'text-orange-700' }
    };
    const s = styles[type] || styles.red;
    
    if (isOccupied) return `border-2 border-solid ${s.border} ${s.bg} shadow-md ${s.text}`;
    return `border-2 border-dashed ${s.border} ${s.emptyBg} opacity-80 hover:opacity-100 ${s.text}`;
};

const DraggableSlot = ({ slot, mode, onClick, onDragEnd, onRotate, onDelete, onConfig, simulatedTime }) => {
    const isOccupied = slot.status === 'occupied';
    const isEditMode = mode === 'edit';
    const slotConfig = SLOT_TYPES[slot.type];
    
    const [pos, setPos] = useState({ x: slot.x, y: slot.y });
    const [isDragging, setIsDragging] = useState(false);
    
    useEffect(() => {
        if (!isDragging) setPos({ x: slot.x, y: slot.y });
    }, [slot.x, slot.y, isDragging]);

    let isWarning = false;
    let isOverdue = false;
    let remainingMs = 0;

    if (isOccupied && slotConfig.fields === 'details' && slot.entryTime) {
        const limitMs = slotConfig.limitHours * MS_PER_HOUR;
        const elapsedMs = simulatedTime - slot.entryTime;
        remainingMs = limitMs - elapsedMs;
        
        if (remainingMs <= WARNING_THRESHOLD && remainingMs > 0) isWarning = true;
        if (remainingMs <= 0) isOverdue = true;
    }

    const handlePointerDown = (e) => {
        if (!isEditMode) return;
        if (e.target.closest('button')) return; // Ignore buttons
        
        e.preventDefault();
        setIsDragging(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const startPosX = pos.x;
        const startPosY = pos.y;

        const handlePointerMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            setPos({ x: Math.max(0, startPosX + dx), y: Math.max(0, startPosY + dy) });
        };

        const handlePointerUp = (upEvent) => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            setIsDragging(false);
            
            const dx = upEvent.clientX - startX;
            const dy = upEvent.clientY - startY;
            const finalX = Math.max(0, startPosX + dx);
            const finalY = Math.max(0, startPosY + dy);
            
            if (finalX !== startPosX || finalY !== startPosY) {
                onDragEnd(slot.id, finalX, finalY);
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
    };

    return (
        <div 
            className={`absolute flex flex-col items-center justify-center box-border select-none transition-all duration-100 ease-linear
                rounded-md z-10
                ${getSlotStyle(slot.type, isOccupied)} 
                ${isEditMode ? 'cursor-move ring-2 ring-transparent hover:ring-blue-400' : 'cursor-pointer'}
                ${isDragging ? 'opacity-50 scale-105 z-50' : ''}
                ${(isWarning || isOverdue) && !isEditMode ? 'ring-4 ring-red-600 animate-pulse' : ''}
            `}
            style={{ 
                left: `${pos.x}px`, 
                top: `${pos.y}px`, 
                width: `${slot.width || 50}px`,
                height: `${slot.height || 90}px`,
                transform: `rotate(${slot.rotation || 0}deg)`,
                transformOrigin: 'center center'
            }}
            onPointerDown={handlePointerDown}
            onClick={() => !isEditMode && onClick(slot)}
        >
            {isEditMode && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex gap-1 z-50 bg-white/90 p-1 rounded-full shadow-md border border-slate-200 backdrop-blur-sm" style={{ transform: `translate(-50%, 0) rotate(-${slot.rotation || 0}deg)` }}>
                    <button onClick={(e) => { e.stopPropagation(); onConfig(slot.id); }} className="bg-slate-100 text-slate-700 p-1.5 rounded-full hover:bg-slate-200 transition-colors" title="Chỉnh kích thước">
                        <Edit2 size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onRotate(slot.id, (slot.rotation || 0) + 90); }} className="bg-blue-100 text-blue-700 p-1.5 rounded-full hover:bg-blue-200 transition-colors" title="Xoay">
                        <RotateCw size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(slot.id); }} className="bg-red-100 text-red-700 p-1.5 rounded-full hover:bg-red-200 transition-colors" title="Xóa">
                        <Trash2 size={14} />
                    </button>
                </div>
            )}

            {!isOccupied ? (
                <div className="flex flex-col items-center gap-1 opacity-60">
                    <span className="text-[10px] font-bold text-center leading-tight uppercase px-1">{slotConfig.label}</span>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center w-full h-full p-1 text-center overflow-hidden gap-1 text-slate-900">
                    <Car size={24} className="rotate-90 flex-shrink-0 opacity-80" />
                    
                    {slotConfig.fields === 'name' ? (
                        <span className="text-[11px] font-bold leading-tight line-clamp-3 break-words w-full px-1">{slot.carName}</span>
                    ) : (
                        <>
                            <span className="text-[11px] font-bold truncate w-full px-1">{slot.carType}</span>
                            <span className="text-[9px] font-mono font-semibold truncate w-full px-1">{slot.chassisNumber}</span>
                            <div className={`text-[10px] font-bold px-1 py-0.5 rounded-sm w-[90%] truncate mt-0.5 shadow-sm
                                ${isOverdue ? 'bg-red-600 text-white' : isWarning ? 'bg-orange-500 text-white' : 'bg-slate-800 text-white'}`}>
                                {formatRemainingTime(remainingMs)}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const EntryModal = ({ isOpen, onClose, slot, onSave, onRemove }) => {
    const [formData, setFormData] = useState({ carName: '', carType: '', chassisNumber: '' });

    useEffect(() => {
        if (slot) {
            setFormData({
                carName: slot.carName || '', 
                carType: slot.carType || '', 
                chassisNumber: slot.chassisNumber || ''
            });
        }
    }, [slot]);

    if (!isOpen || !slot) return null;
    const isOccupied = slot.status === 'occupied';
    const config = SLOT_TYPES[slot.type];
    const isSimpleSlot = config.fields === 'name';

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { status: 'occupied', ...formData };
        if (!isOccupied && !isSimpleSlot) {
            payload.entryTime = Date.now();
        }
        onSave(slot.id, payload);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <div>
                        <h2 className="font-bold text-lg text-slate-800">{isOccupied ? 'Thông tin Xe' : 'Nhập Xe Mới'}</h2>
                        <p className="text-xs font-semibold text-slate-500 uppercase">{config.label}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-800 font-bold p-1">✕</button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {isSimpleSlot ? (
                        <div>
                            <label className="block text-sm font-semibold mb-1 text-slate-700">Tên xe / Biển số</label>
                            <input 
                                autoFocus required type="text"
                                className="w-full border-2 border-slate-200 rounded-lg p-3 focus:border-blue-500 outline-none transition-colors"
                                placeholder="VD: Mazda CX-5 Trắng..."
                                value={formData.carName} onChange={e => setFormData({...formData, carName: e.target.value})}
                            />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-slate-700">Loại Xe</label>
                                <input 
                                    autoFocus required type="text"
                                    className="w-full border-2 border-slate-200 rounded-lg p-3 focus:border-blue-500 outline-none transition-colors"
                                    placeholder="VD: KIA Seltos"
                                    value={formData.carType} onChange={e => setFormData({...formData, carType: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold mb-1 text-slate-700">Số Khung / VIN</label>
                                <input 
                                    required type="text"
                                    className="w-full border-2 border-slate-200 rounded-lg p-3 focus:border-blue-500 outline-none uppercase font-mono transition-colors"
                                    placeholder="Nhập số khung..."
                                    value={formData.chassisNumber} onChange={e => setFormData({...formData, chassisNumber: e.target.value})}
                                />
                            </div>
                            
                            <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700 border border-blue-100 flex items-start gap-2">
                                <Info size={16} className="mt-0.5 flex-shrink-0" />
                                <div>
                                    <span className="font-bold block">Quy định thời gian: Tối đa {config.limitHours} Giờ.</span>
                                    {!isOccupied && <span>Thời gian sẽ bắt đầu đếm ngược từ lúc bạn nhấn Lưu.</span>}
                                    {isOccupied && <span>Hệ thống sẽ nháy đỏ cảnh báo khi thời gian còn lại dưới 4 tiếng.</span>}
                                </div>
                            </div>
                        </>
                    )}

                    <div className="flex gap-3 pt-4 border-t mt-2">
                        {isOccupied && (
                            <button type="button" onClick={() => { onRemove(slot.id); onClose(); }} className="flex-1 bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-lg font-semibold hover:bg-red-100 transition-colors">
                                Cho Xe Ra
                            </button>
                        )}
                        <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg font-semibold hover:bg-slate-200 transition-colors">Đóng</button>
                        <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-sm">{isOccupied ? 'Cập nhật' : 'Lưu'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SlotConfigModal = ({ isOpen, onClose, slot, onSave }) => {
    const [w, setW] = useState(50);
    const [h, setH] = useState(90);
    const [rot, setRot] = useState(0);

    useEffect(() => {
        if (slot) {
            setW(slot.width || 50);
            setH(slot.height || 90);
            setRot(slot.rotation || 0);
        }
    }, [slot]);

    if (!isOpen || !slot) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden p-5 animate-in fade-in zoom-in duration-200">
                <h2 className="font-bold text-lg mb-4 text-slate-800">Điều chỉnh Ô Đỗ Xe</h2>
                <div className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-semibold mb-1 text-slate-700">Rộng (px)</label>
                            <input type="number" value={w} onChange={e => setW(Number(e.target.value))} className="w-full border-2 border-slate-200 p-2 rounded-lg focus:border-purple-500 outline-none transition-colors" />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-semibold mb-1 text-slate-700">Dài (px)</label>
                            <input type="number" value={h} onChange={e => setH(Number(e.target.value))} className="w-full border-2 border-slate-200 p-2 rounded-lg focus:border-purple-500 outline-none transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1 text-slate-700">Góc xoay (độ)</label>
                        <input type="number" value={rot} onChange={e => setRot(Number(e.target.value))} className="w-full border-2 border-slate-200 p-2 rounded-lg focus:border-purple-500 outline-none transition-colors" />
                    </div>
                </div>
                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg font-semibold hover:bg-slate-200 transition-colors">Hủy</button>
                    <button onClick={() => { onSave(slot.id, { width: w, height: h, rotation: rot }); onClose(); }} className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-colors shadow-sm">Lưu Thay Đổi</button>
                </div>
            </div>
        </div>
    );
};

const PasswordModal = ({ isOpen, onClose, onSuccess }) => {
    const [pwd, setPwd] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen) {
            setPwd('');
            setError('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        // Mật khẩu để vào chế độ thiết kế (Có thể thay đổi tại đây)
        if (pwd === 'admin123') {
            onSuccess();
        } else {
            setError('Mật khẩu không chính xác!');
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[300] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                    <h2 className="font-bold text-lg text-slate-800">Xác thực Quyền Quản trị</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-800 font-bold p-1">✕</button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-1 text-slate-700">Nhập mật khẩu để thiết kế bản đồ:</label>
                        <input 
                            autoFocus
                            type="password"
                            className="w-full border-2 border-slate-200 rounded-lg p-3 focus:border-purple-500 outline-none transition-colors"
                            placeholder="Mật khẩu..."
                            value={pwd}
                            onChange={e => setPwd(e.target.value)}
                        />
                        {error && <p className="text-red-500 text-xs font-bold mt-1">{error}</p>}
                        <p className="text-slate-400 text-xs mt-2 italic">Gợi ý: Mật khẩu mặc định là <b>admin123</b></p>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button type="button" onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg font-semibold hover:bg-slate-200 transition-colors">Hủy</button>
                        <button type="submit" className="flex-1 bg-purple-600 text-white py-2.5 rounded-lg font-semibold hover:bg-purple-700 transition-colors shadow-sm">Xác nhận</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function App() {
    const [user, setUser] = useState(null);
    const [slots, setSlots] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [configSlot, setConfigSlot] = useState(null);
    const [mode, setMode] = useState('manage'); // 'manage' | 'edit'
    const [bgImage, setBgImage] = useState(null);
    
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isAdminAuth, setIsAdminAuth] = useState(false);
    
    const [realTime, setRealTime] = useState(Date.now());
    const [timeOffset, setTimeOffset] = useState(0);
    const simulatedTime = realTime + timeOffset;

    const fileInputRef = useRef(null);

    useEffect(() => {
        const storedImage = localStorage.getItem('parking_bg_image');
        if (storedImage) setBgImage(storedImage);
    }, []);

    useEffect(() => {
        const timer = setInterval(() => setRealTime(Date.now()), 60000); // Cập nhật mỗi phút
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const initAuth = async () => {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        };
        initAuth();
        const unsubscribe = onAuthStateChanged(auth, setUser);
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!user) return;
        const slotsRef = collection(db, 'artifacts', appId, 'public', 'data', 'parking_layout_v2');
        
        const unsubscribe = onSnapshot(slotsRef, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSlots(fetched);
            setLoading(false);
        }, (error) => {
            console.error(error);
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [user]);

    const handleAddSlot = async (type) => {
        if (!user) return;
        const newId = `slot_${Date.now()}`;
        const newSlot = {
            type, x: 150, y: 150, width: 50, height: 90, rotation: 0, status: 'empty'
        };
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parking_layout_v2', newId), newSlot);
    };

    const handleDeleteSlot = async (slotId) => {
        if (!user) return;
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parking_layout_v2', slotId));
    };

    const handleUpdateSlotAttr = async (slotId, updates) => {
        if (!user) return;
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parking_layout_v2', slotId), updates);
    };

    const handleSaveCarData = async (slotId, data) => {
        handleUpdateSlotAttr(slotId, data);
    };

    const handleRemoveCar = async (slotId) => {
        handleUpdateSlotAttr(slotId, {
            status: 'empty', carName: null, carType: null, chassisNumber: null, entryTime: null
        });
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const base64Data = event.target.result;
            localStorage.setItem('parking_bg_image', base64Data);
            setBgImage(base64Data);
        };
        reader.readAsDataURL(file);
    };

    const handleResetMap = () => {
        if (window.confirm("Bạn có chắc muốn xóa ảnh nền?")) {
            localStorage.removeItem('parking_bg_image');
            setBgImage(null);
        }
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center font-bold text-slate-500 bg-slate-100">
            <div className="animate-spin mr-3 rounded-full h-6 w-6 border-t-2 border-b-2 border-slate-600"></div>
            Đang tải dữ liệu sa bàn...
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-200 flex flex-col font-sans overflow-hidden">
            
            {/* Top Toolbar */}
            <div className="bg-slate-900 text-white p-3 shadow-xl flex flex-col md:flex-row gap-4 justify-between items-center z-30 relative shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-lg"><Car size={20} /></div>
                    <div>
                        <h1 className="text-lg font-bold tracking-wide">Quản Lý Chỗ Đỗ Xe Thaco</h1>
                        <p className="text-xs text-slate-400">Đồng bộ theo thời gian thực</p>
                    </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    {mode === 'manage' && (
                        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                            <button onClick={() => setTimeOffset(0)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors text-slate-300 text-sm font-semibold" title="Reset Thời Gian">
                                Thời gian thực
                            </button>
                            <button onClick={() => setTimeOffset(prev => prev + 10 * MS_PER_HOUR)} className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-md text-sm font-bold transition-colors">
                                <FastForward size={16} /> +10 Giờ
                            </button>
                            {timeOffset > 0 && <span className="text-xs text-orange-400 font-bold ml-1 px-2">Đang tua nhanh...</span>}
                        </div>
                    )}

                    <div className="flex rounded-lg bg-slate-800 p-1 border border-slate-700">
                        <button 
                            onClick={() => setMode('manage')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${mode === 'manage' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            <MousePointer2 size={16} /> Chế độ Quản lý
                        </button>
                        <button 
                            onClick={() => {
                                if (isAdminAuth) {
                                    setMode('edit');
                                } else {
                                    setIsPasswordModalOpen(true);
                                }
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors ${mode === 'edit' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                        >
                            <Settings size={16} /> Chế độ Thiết kế
                        </button>
                    </div>
                </div>
            </div>

            {/* Edit Mode Toolbar */}
            {mode === 'edit' && (
                <div className="bg-slate-800 border-t border-slate-700 p-3 flex flex-wrap justify-center gap-3 z-20 shrink-0 shadow-md">
                    <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
                    
                    <div className="flex gap-2 mr-4 border-r border-slate-700 pr-4">
                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-sm text-white font-semibold transition-colors">
                            <Upload size={16} /> Tải Ảnh Nền
                        </button>
                        {bgImage && (
                            <button onClick={handleResetMap} className="flex items-center gap-1.5 bg-red-900/50 hover:bg-red-800 px-3 py-1.5 rounded text-sm text-red-200 font-semibold transition-colors">
                                Xóa Ảnh
                            </button>
                        )}
                    </div>
                    
                    <span className="text-slate-400 text-sm flex items-center font-semibold mr-2">Thêm Slot:</span>
                    <button onClick={() => handleAddSlot('red')} className="flex items-center gap-1 bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded text-sm text-white font-semibold transition-colors shadow-sm">
                        <Plus size={16} /> Công xa
                    </button>
                    <button onClick={() => handleAddSlot('blue')} className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded text-sm text-white font-semibold transition-colors shadow-sm">
                        <Plus size={16} /> Khách hàng
                    </button>
                    <button onClick={() => handleAddSlot('green')} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded text-sm text-white font-semibold transition-colors shadow-sm">
                        <Plus size={16} /> PDI (72h)
                    </button>
                    <button onClick={() => handleAddSlot('orange')} className="flex items-center gap-1 bg-orange-500 hover:bg-orange-400 px-3 py-1.5 rounded text-sm text-white font-semibold transition-colors shadow-sm">
                        <Plus size={16} /> PDI Ngắn (24h)
                    </button>
                </div>
            )}

            {/* Map Area */}
            <div className="flex-1 overflow-auto relative bg-slate-300">
                <div className="relative inline-block min-w-full min-h-[1000px] bg-white mx-auto shadow-2xl transition-all duration-300"
                     style={{
                         backgroundImage: !bgImage ? 'repeating-linear-gradient(45deg, #f1f5f9 25%, transparent 25%, transparent 75%, #f1f5f9 75%, #f1f5f9), repeating-linear-gradient(45deg, #f1f5f9 25%, #ffffff 25%, #ffffff 75%, #f1f5f9 75%, #f1f5f9)' : 'none',
                         backgroundPosition: '0 0, 15px 15px',
                         backgroundSize: '30px 30px'
                     }}>
                    
                    {bgImage && (
                        <img 
                            src={bgImage} 
                            alt="Map Background" 
                            className="block object-contain pointer-events-none"
                            style={{ minWidth: '1200px', minHeight: '800px' }} 
                        />
                    )}

                    {slots.map(s => (
                        <DraggableSlot 
                            key={s.id} 
                            slot={s} 
                            mode={mode}
                            onClick={setSelectedSlot} 
                            onDragEnd={(id, x, y) => handleUpdateSlotAttr(id, { x, y })}
                            onRotate={(id, rotation) => handleUpdateSlotAttr(id, { rotation: rotation % 360 })}
                            onDelete={handleDeleteSlot}
                            onConfig={(id) => setConfigSlot(slots.find(slot => slot.id === id))}
                            simulatedTime={simulatedTime} 
                        />
                    ))}
                    
                    {!bgImage && slots.length === 0 && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-slate-400 flex flex-col items-center select-none pointer-events-none text-center">
                            <Upload size={48} className="mb-4 opacity-50" />
                            <p className="font-bold text-xl text-slate-500">Bản đồ đang trống</p>
                            <p className="text-sm mt-2 max-w-sm">Chuyển sang <b>Chế độ Thiết kế</b>, tải ảnh nền bản vẽ lên và kéo thả các ô đỗ xe vào đúng vị trí.</p>
                        </div>
                    )}
                </div>

                {/* Floating Legend (Chú giải) */}
                <div className="absolute bottom-6 right-6 bg-white/95 backdrop-blur shadow-2xl border border-slate-200 p-4 rounded-xl z-20 pointer-events-none">
                    <h3 className="font-bold text-sm text-slate-800 border-b pb-2 mb-3 uppercase tracking-wider">Chú Giải Bãi Đỗ Xe</h3>
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded border-2 border-red-500 bg-red-100 shrink-0"></div>
                            <div className="text-sm">
                                <p className="font-bold text-slate-800">Xe Công xa</p>
                                <p className="text-[10px] text-slate-500 leading-tight">Chỉ nhập Tên Xe</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded border-2 border-green-500 bg-green-100 shrink-0"></div>
                            <div className="text-sm">
                                <p className="font-bold text-slate-800">Xe PDI</p>
                                <p className="text-[10px] text-slate-500 leading-tight">Loại Xe, Số Khung. Giới hạn 72h</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded border-2 border-orange-500 bg-orange-100 shrink-0"></div>
                            <div className="text-sm">
                                <p className="font-bold text-slate-800">Xe PDI (Ngắn hạn)</p>
                                <p className="text-[10px] text-slate-500 leading-tight">Loại Xe, Số Khung. Giới hạn 24h</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded border-2 border-blue-500 bg-blue-100 shrink-0"></div>
                            <div className="text-sm">
                                <p className="font-bold text-slate-800">Xe Khách Hàng</p>
                                <p className="text-[10px] text-slate-500 leading-tight">Chỉ nhập Tên Xe</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <EntryModal 
                isOpen={!!selectedSlot} 
                onClose={() => setSelectedSlot(null)} 
                slot={selectedSlot}
                onSave={handleSaveCarData}
                onRemove={handleRemoveCar}
            />

            <SlotConfigModal
                isOpen={!!configSlot}
                onClose={() => setConfigSlot(null)}
                slot={configSlot}
                onSave={handleUpdateSlotAttr}
            />

            {/* Modal Nhập mật khẩu */}
            <PasswordModal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                onSuccess={() => {
                    setIsAdminAuth(true);
                    setIsPasswordModalOpen(false);
                    setMode('edit');
                }}
            />
        </div>
    );
}