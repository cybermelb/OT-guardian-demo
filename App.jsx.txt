import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, serverTimestamp, setLogLevel } from 'firebase/firestore';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'; // Import Auth services
import { X, CheckCircle, AlertTriangle, Cpu, HardHat, BarChart2, Shield, Settings, User, BookOpen, Clock, Zap, Target, MapPin, Users, Filter, ArrowDownUp, LogOut } from 'lucide-react';

// --- CONFIGURATION CHECK & CONSTANTS ---
let firebaseConfig = {};
let appId = 'default-app-id';

try {
  const fConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const aId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  
  if (fConfig && fConfig.apiKey && fConfig.projectId) {
      firebaseConfig = { apiKey: "AIzaSyAyDKqA-j9yjp4KeGPGR49Cr6_q_drxBVs",
  authDomain: "otgaurdian.firebaseapp.com",
  projectId: "otgaurdian",
  storageBucket: "otgaurdian.firebasestorage.app",
  messagingSenderId: "719542806938",
  appId: "1:719542806938:web:ed9376fcc7d04851e47223",
  measurementId: "G-9FMPGC5C93" };
      appId = aId;
  }
} catch (e) {
  console.warn("Firebase configuration parsing failed, running with Mock data only.");
}

// Simulated Role Mapping based on UIDs (In a real app, this would come from a Firestore 'users' collection)
const USER_ROLES_MAP = {
    // NOTE FOR USER: This is where you would map a user's unique ID to a role.
    // In this demo, we use placeholder UIDs.
    'ZP6wE0ha6FWY9G4wJGXaVhRHioj2': 'admin',
    'JzUrZlEonaPM59hJEEM3waNzNOk2': 'engineer', 
   };

// Global constants for data setup (IEC 62443-3-3 Foundational Requirements)
const IEC_FR_CONTROLS = [
  { id: 'FR1_IAC', fr: 'FR1', name: 'Identification & Authentication Control (IAC)', targetSL: 3, controls: [
    { cid: 'IAC1', requirement: 'Unique User IDs', status: 'Not Assessed' },
    { cid: 'IAC2', requirement: 'MFA for Admins (Updated to align with latest spec)', status: 'Not Assessed' },
    { cid: 'IAC3', requirement: 'Password Complexity and Rotation', status: 'Not Assessed' },
  ]},
  { id: 'FR2_UC', fr: 'FR2', name: 'Use Control (UC)', targetSL: 2, controls: [
    { cid: 'UC1', requirement: 'Role-Based Access Control (RBAC)', status: 'Not Assessed' },
    { cid: 'UC2', requirement: 'Least Privilege Enforcement', status: 'Not Assessed' },
    { cid: 'UC3', requirement: 'Audit Log Retention', status: 'Not Assessed' },
  ]},
  { id: 'FR3_SI', fr: 'FR3', name: 'System Integrity (SI)', targetSL: 3, controls: [
    { cid: 'SI1', requirement: 'Software Integrity Checks (Hashing/Digital Signatures)', status: 'Not Assessed' },
    { cid: 'SI2', requirement: 'Automated Patch Management Process', status: 'Not Assessed' },
    { cid: 'SI3', requirement: 'Anti-Malware and Application Whitelisting', status: 'Not Assessed' },
  ]},
];

// Refined Asset Types categorized by Purdue Model relevance
const ASSET_TYPES = [
    // Level 3/4 (Operations/Site Business)
    'Application Server', 'Database Server', 'Historian', 'Domain Controller', 'Engineering Workstation', 'DCS/SCADA Server',
    // Level 2 (Control Systems)
    'Control Server', 'Local HMI', 'PLC/PAC', 'Remote Terminal Unit (RTU)',
    // Level 1/0 (Basic Control/Process)
    'Field Controller', 'Safety Instrumented System (SIS)', 'Sensors/Actuators', 'Intelligent Electronic Device (IED)'
];

const PURDUE_ZONES = [
    'Level 5 - Enterprise', 
    'Level 4 - Business Logistics', 
    'Level 3 - Operations Management', 
    'Level 2 - Control Systems', 
    'Level 1 - Basic Control', 
    'Level 0 - Process'
];
const IMPACT_LEVELS = ['High', 'Medium', 'Low'];
const SITE_LOCATIONS = ['Plant A - Midwest', 'Plant B - South East', 'R&D Lab'];

// --- APP COMPONENT ---

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  
  // Authentication States
  const [user, setUser] = useState(null); // The authenticated user object
  const [isAuthReady, setIsAuthReady] = useState(false); // Flag for when auth check is complete
  
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentView, setCurrentView] = useState('riskDashboard');
  
  // Application Data States
  const [assets, setAssets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [registeredUsers] = useState([
    { id: 'dev-admin-uid-12345', email: 'admin@otguardian.com', role: 'admin' },
    { id: 'mock-engineer-uid', email: 'jane.engineer@otguardian.com', role: 'engineer' },
    { id: 'mock-analyst-uid', email: 'bob.analyst@otguardian.com', role: 'analyst' },
  ]);

  const MOCK_ASSETS = useMemo(() => ([{ 
      id: 'plc-01-mock', 
      name: 'PLC-01', 
      type: 'PLC/PAC', 
      zone: 'Level 2 - Control Systems', 
      location: 'Plant A - Midwest',
      owner: 'Jane Engineer', 
      impact: 'High', 
      controls: JSON.parse(JSON.stringify(IEC_FR_CONTROLS)),
  }]), []);

  const MOCK_TASKS = useMemo(() => ([{ 
      id: 'task-1-mock', 
      assetName: 'PLC-01', 
      description: 'Remediate IAC1 gap on PLC-01.', 
      priority: 'Critical', 
      status: 'Open',
      createdBy: 'System Mock',
  }]), []);
  
  // Helper to determine role and access for display
  const userRole = user?.role || 'Guest';

  // --- RBAC CHECK ---
  const checkWriteAccess = () => {
    // Only allow write/edit access for authenticated admins, engineers, or analysts
    return user && (user.role === 'admin' || user.role === 'engineer' || user.role === 'analyst');
  };
  const checkAdminAccess = () => {
    // Only allow admin access for admins
    return user && user.role === 'admin';
  };
  
  // --- FIREBASE INITIALIZATION & DATA LISTENERS (Combined Logic) ---
  useEffect(() => {
    let unsubscribeAuth = () => {};
    let unsubscribeAssets = () => {};
    let unsubscribeTasks = () => {};
    let isMounted = true; 

    // Function to handle the final unblock of the UI
    const unblockUI = (isError = false) => {
        if (isMounted) {
            setTimeout(() => setLoading(false), 50);
            if (isError) {
                setErrorMessage("DATA FAIL: Could not connect to persistent storage. Running with Mock data only. Functionality is limited.");
            }
        }
    };

    // 1. Check if configuration is available to attempt Firebase data connection
    if (!firebaseConfig.apiKey) {
        console.warn("No Firebase Config found, running with Mock data only.");
        setUser({ uid: 'mock-offline-user', email: 'faysalhasan2001@yahoo.com', role: 'engineer' });
        setIsAuthReady(true);
        setAssets(MOCK_ASSETS);
        setTasks(MOCK_TASKS);
        unblockUI();
        return () => { isMounted = false; };
    }

    // --- FIREBASE ONLINE DATA MODE ---
    setLogLevel('debug');

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const userAuth = getAuth(app);
      setDb(firestore);
      setAuth(userAuth);

      // 1. AUTHENTICATION LISTENER
      unsubscribeAuth = onAuthStateChanged(userAuth, (authUser) => {
        if (isMounted) {
          if (authUser) {
            // Map UID to a simulated role or default to 'engineer'
            const role = USER_ROLES_MAP[authUser.uid] || 'engineer';
            setUser({ 
              uid: authUser.uid, 
              email: authUser.email || `anon-${authUser.uid.substring(0, 8)}@otguardian.com`, 
              role 
            });
          } else {
            setUser(null);
          }
          setIsAuthReady(true); // Auth check is complete
          
          // CRITICAL: Unblock UI only after the first auth state check
          unblockUI();
        }
      });

      // 2. Initial Sign-In Attempt
      const signInUser = async () => {
          const authToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
          try {
              if (authToken) {
                  await signInWithCustomToken(userAuth, authToken);
              } else {
                  await signInAnonymously(userAuth);
              }
          } catch (e) {
              console.error("Firebase Sign-in Failed:", e);
              // Allow onAuthStateChanged to handle the null user state
          }
      };
      signInUser();

      // 3. DATA LISTENERS (Start after Auth is ready and user object is set)

      const assetsRef = collection(firestore, `artifacts/${appId}/public/data/assets`);
      const tasksRef = collection(firestore, `artifacts/${appId}/public/data/tasks`);

      // ASSET LISTENER (Triggered when user state changes, which includes sign-in)
      const setupListeners = (currentUser) => {
        if (!currentUser) {
            // If user is null (logged out), use mock data
            setAssets(MOCK_ASSETS);
            setTasks(MOCK_TASKS);
            return () => {}; // Return a dummy cleanup
        }
        
        unsubscribeAssets = onSnapshot(query(assetsRef), (snapshot) => {
            if (!isMounted) return;
            const fetchedAssets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const list = fetchedAssets.length === 0 ? MOCK_ASSETS : fetchedAssets;
            const stableAssets = list.map(a => ({
                ...a, location: a.location || 'Unknown Location', owner: a.owner || 'Unassigned',
            }));
            setAssets(stableAssets);
        }, (error) => {
            console.error("Error fetching assets:", error);
            setErrorMessage("Error fetching assets data.");
            setAssets(MOCK_ASSETS); 
        });
        
        unsubscribeTasks = onSnapshot(query(tasksRef), (snapshot) => {
            if (!isMounted) return;
            const fetchedTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(fetchedTasks.length === 0 ? MOCK_TASKS : fetchedTasks);
        }, (error) => {
            console.error("Error fetching tasks:", error);
            setErrorMessage("Error fetching tasks data.");
            setTasks(MOCK_TASKS); 
        });

        // Return a cleanup function for the listeners
        return () => {
            unsubscribeAssets();
            unsubscribeTasks();
        };
      };
      
      // Cleanup for the previous listeners when the user state changes
      return setupListeners(user);

    } catch (e) {
      console.error("Firebase Data Initialization Error:", e);
      setUser(null);
      setIsAuthReady(true);
      setAssets(MOCK_ASSETS);
      setTasks(MOCK_TASKS);
      unblockUI(true);
    }
    
    // Final cleanup for the component
    return () => {
      isMounted = false;
      unsubscribeAuth();
      unsubscribeAssets(); // Ensure these are called if the app shuts down
      unsubscribeTasks();
    };
  }, [user, isAuthReady]); // Re-run effect if user or auth readiness changes

  // --- DATA MANAGEMENT HANDLERS (with RBAC checks) ---
  const addAsset = async (newAsset) => {
    if (!checkWriteAccess()) {
        setErrorMessage("Permission Denied: Only authenticated Engineers/Admins can add assets.");
        return;
    }
    if (!db) { setErrorMessage("Data storage unavailable. Cannot add asset in OFFLINE MODE."); return; }
    try {
      const assetsRef = collection(db, `artifacts/${appId}/public/data/assets`);
      const docId = newAsset.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/--+/g, '-');
      const initialControls = {
        controls: JSON.parse(JSON.stringify(IEC_FR_CONTROLS)),
      };
      await setDoc(doc(assetsRef, docId), { ...newAsset, ...initialControls, createdAt: serverTimestamp() });
      setErrorMessage('');
    } catch (e) {
      console.error("Error adding asset:", e);
      setErrorMessage("Failed to add asset. Check console for details.");
    }
  };

  const updateAssetControl = async (assetId, framework, frId, controlId, newStatus, notes) => {
    if (!checkWriteAccess()) {
        setErrorMessage("Permission Denied: Only authenticated Engineers/Admins can update control status.");
        return;
    }
    if (!db) { setErrorMessage("Data storage unavailable. Cannot update control in OFFLINE MODE."); return; }

    const assetRef = doc(db, `artifacts/${appId}/public/data/assets`, assetId);
    const asset = assets.find(a => a.id === assetId);

    if (!asset) return;

    let updatedData = {};
    
    if (framework === 'IEC') {
        const updatedFRs = asset.controls.map(fr => {
            if (fr.id === frId) {
                const updatedControls = fr.controls.map(c => 
                    c.cid === controlId ? { ...c, status: newStatus, notes: notes || '' } : c
                );
                return { ...fr, controls: updatedControls };
            }
            return fr;
        });
        updatedData.controls = updatedFRs;
    }


    try {
        await setDoc(assetRef, updatedData, { merge: true });
        setErrorMessage('');
    } catch (e) {
        console.error("Error updating control:", e);
        setErrorMessage("Failed to update control status. Check console for details.");
    }
  };

  const addTask = async (taskDetails) => {
    if (!checkWriteAccess()) {
        setErrorMessage("Permission Denied: Only authenticated Engineers/Admins can create tasks.");
        return;
    }
    if (!db) { setErrorMessage("Data storage unavailable. Cannot add task in OFFLINE MODE."); return; }
    try {
      const tasksRef = collection(db, `artifacts/${appId}/public/data/tasks`);
      const docId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await setDoc(doc(tasksRef, docId), {
        ...taskDetails,
        id: docId,
        status: 'Open',
        priority: taskDetails.priority || 'Medium',
        createdAt: serverTimestamp(),
        createdBy: user?.email || 'System User', // Use authenticated user email
      }, { merge: true });
      setErrorMessage('');
    } catch (e) {
      console.error("Error adding task:", e);
      setErrorMessage("Failed to create task. Check console for details.");
    }
  };

  const updateTaskStatus = async (taskId, newStatus) => {
    if (!checkWriteAccess()) {
        setErrorMessage("Permission Denied: Only authenticated Engineers/Admins can update task status.");
        return;
    }
    if (!db) { setErrorMessage("Data storage unavailable. Cannot update task in OFFLINE MODE."); return; }
    try {
      const taskRef = doc(db, `artifacts/${appId}/public/data/tasks`, taskId);
      await setDoc(taskRef, { status: newStatus, completedAt: newStatus === 'Complete' ? serverTimestamp() : null }, { merge: true });
      setErrorMessage('');
    } catch (e) {
      console.error("Error updating task:", e);
      setErrorMessage("Failed to update task status. Check console for details.");
    }
  };
  
  const handleSignOut = () => {
    if (auth) {
        signOut(auth)
            .then(() => {
                setErrorMessage("Successfully signed out. Application is now in read-only mode.");
                setCurrentView('riskDashboard');
            })
            .catch(e => {
                console.error("Sign out error:", e);
                setErrorMessage("Failed to sign out.");
            });
    }
  };

  // --- ANALYSIS COMPUTATIONS & COMPONENTS (Unchanged logic) ---
  const complianceData = useMemo(() => {
    let totalIECControls = 0;
    let implementedIECControls = 0;
    
    assets.forEach(asset => {
        asset.controls?.forEach(fr => {
            fr.controls?.forEach(c => {
                totalIECControls++;
                if (c.status === 'Implemented') implementedIECControls++;
            });
        });
    });

    const overallCompliance = totalIECControls > 0 ? Math.round((implementedIECControls / totalIECControls) * 100) : 0;

    return {
        totalAssets: assets.length, 
        overallCompliance,
        iec: { implemented: implementedIECControls, total: totalIECControls, percent: overallCompliance },
        openTasks: tasks.filter(t => t.status === 'Open' || t.status === 'In Progress').length,
    };
  }, [assets, tasks]);

  const Card = ({ title, value, icon, className = '' }) => (
    <div className={`p-5 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center space-x-4 ${className}`}>
      <div className="p-3 rounded-full bg-indigo-100 text-indigo-600 flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );

  const ProgressRing = ({ percent, size = 120, color = 'indigo' }) => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="10"
          className="text-gray-200"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={`text-${color}-500 transition-all duration-1000`}
        />
        <text
          x="50"
          y="50"
          dominantBaseline="central"
          textAnchor="middle"
          className={`text-xl font-bold text-${color}-600`}
          style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}
        >
          {percent}%
        </text>
      </svg>
    );
  };

  // --- VIEW COMPONENTS ---

  const RiskDashboard = () => (
    <div className="p-4 sm:p-8 space-y-8">
      <h2 className="text-3xl font-bold text-gray-800 border-b pb-2 flex items-center space-x-2"><Shield className="w-6 h-6" /> OT Guardian Risk Dashboard</h2>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        <Card title="Total Monitored Assets" value={complianceData.totalAssets} icon={<Cpu />} />
        <Card title="Overall IEC 62443 Compliance" value={`${complianceData.iec.percent}%`} icon={<BarChart2 />} className="bg-indigo-50" />
        <Card title="Open Remediation Tasks" value={complianceData.openTasks} icon={<HardHat />} className="bg-red-50" />
        <Card title="Target SL Achieved (Mock)" value="SL-2 / SL-3" icon={<Target />} />
      </div>
      {errorMessage && (
            <p className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-lg">
                {errorMessage}
            </p>
      )}

      <div className="grid md:grid-cols-3 gap-6 pt-4">
        {/* Risk Heatmap (Mocked) */}
        <div className="md:col-span-2 p-6 bg-white rounded-xl shadow-xl border">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">Risk Heatmap by Purdue Zone</h3>
          <p className="text-sm text-gray-500 mb-4">
             
          </p>
          <div className="space-y-3">
            {PURDUE_ZONES.slice(2, 5).map((zone, i) => (
              <div key={zone} className="flex justify-between items-center">
                <span className="font-medium text-gray-700 w-1/4 min-w-[120px]">{zone}</span>
                <div className="flex-grow h-4 bg-gray-200 rounded-full mx-4">
                  <div 
                    className={`h-4 rounded-full ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${90 - i * 30}%` }}
                  ></div>
                </div>
                <span className="text-sm font-semibold w-1/6 text-right">{90 - i * 30}% Risk/Compliance (Mock)</span>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Progress */}
        <div className="p-6 bg-white rounded-xl shadow-xl border flex flex-col items-center justify-center">
          <h3 className="text-xl font-semibold mb-4 text-gray-700">IEC Compliance Status</h3>
          <ProgressRing percent={complianceData.iec.percent} size={150} color="indigo" />
          <p className="text-sm text-gray-500 mt-4">
            Total Controls Assessed: **{complianceData.iec.total}**
          </p>
          <p className="text-sm text-gray-500">
            Implemented Controls: **{complianceData.iec.implemented}**
          </p>
        </div>
      </div>
    </div>
  );

  const AssetBuilder = () => {
    const [name, setName] = useState('');
    const [type, setType] = useState(ASSET_TYPES[0]);
    const [zone, setZone] = useState(PURDUE_ZONES[2]);
    const [location, setLocation] = useState(SITE_LOCATIONS[0]);
    const [owner, setOwner] = useState('Unassigned Engineer');
    const [impact, setImpact] = useState(IMPACT_LEVELS[1]);

    const [filterLocation, setFilterLocation] = useState('All');
    const [sortKey, setSortKey] = useState('name');
    const [sortDirection, setSortDirection] = useState('asc');

    const handleAddAsset = (e) => {
        e.preventDefault();
        if (name.trim()) {
            addAsset({ name, type, zone, location, owner, impact });
            setName('');
            setOwner('Unassigned Engineer');
        }
    };
    
    // Filter and Sort Logic (unchanged)
    const filteredAndSortedAssets = useMemo(() => {
        let list = assets;
        if (filterLocation !== 'All') {
            list = list.filter(asset => asset.location === filterLocation);
        }
        list.sort((a, b) => {
            const aValue = a[sortKey] || '';
            const bValue = b[sortKey] || '';
            if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [assets, filterLocation, sortKey, sortDirection]);

    const toggleSort = (key) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };
    
    const renderSortIcon = (key) => {
        if (sortKey !== key) return <ArrowDownUp className="w-3 h-3 text-gray-400" />;
        return sortDirection === 'asc' 
            ? <ArrowDownUp className="w-3 h-3 rotate-180 text-indigo-600" /> 
            : <ArrowDownUp className="w-3 h-3 text-indigo-600" />;
    };


    return (
      <div className="p-4 sm:p-8 space-y-8">
        <h2 className="text-3xl font-bold text-gray-800 border-b pb-2 flex items-center space-x-2"><Cpu className="w-6 h-6" /> Asset Builder: OT Inventory & Zones</h2>
        
        {checkWriteAccess() ? (
            <div className="bg-white p-6 rounded-xl shadow-lg border">
                <h3 className="text-xl font-semibold mb-4">Add New Asset (Includes Zone & Type Refinement)</h3>
                <form onSubmit={handleAddAsset} className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                    <input type="text" placeholder="Asset Name (e.g., HMI-02)" value={name} onChange={(e) => setName(e.target.value)} required className="col-span-2 p-3 border rounded-lg focus:ring-indigo-500" />
                    
                    {/* Updated Asset Type Dropdown */}
                    <select value={type} onChange={(e) => setType(e.target.value)} className="p-3 border rounded-lg">
                        {ASSET_TYPES.map(t => <option key={t} value={t}><Cpu className="w-4 h-4 mr-2 inline" />{t}</option>)}
                    </select>
                    
                    {/* Updated Zone Dropdown */}
                    <select value={zone} onChange={(e) => setZone(e.target.value)} className="p-3 border rounded-lg">
                        {PURDUE_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                    
                    <select value={location} onChange={(e) => setLocation(e.target.value)} className="p-3 border rounded-lg">
                        {SITE_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <input type="text" placeholder="Owner/Engineer (e.g., Jane Smith)" value={owner} onChange={(e) => setOwner(e.target.value)} required className="p-3 border rounded-lg focus:ring-indigo-500" />
                    <button type="submit" className="col-span-2 md:col-span-6 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition font-semibold shadow-md">Add Asset to Inventory</button>
                </form>
            </div>
        ) : (
             <div className="p-4 text-center text-sm text-yellow-800 bg-yellow-100 rounded-xl border border-yellow-300">
                You are currently in **READ-ONLY** mode. Only authenticated Engineers or Admins can add new assets.
            </div>
        )}
        
        {errorMessage && (
            <p className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-lg">
                {errorMessage}
            </p>
        )}

        {/* Asset List with Filter/Sort (Read access for all) */}
        <div className="bg-white p-6 rounded-xl shadow-lg border">
            <h3 className="text-xl font-semibold mb-4">Current OT Inventory ({filteredAndSortedAssets.length} of {assets.length})</h3>
            
            <div className="flex items-center space-x-3 mb-4 p-3 border rounded-lg bg-gray-50">
                <Filter className="w-4 h-4 text-gray-500" />
                <label className="text-sm font-medium text-gray-700">Filter by Site Location:</label>
                <select 
                    value={filterLocation} 
                    onChange={(e) => setFilterLocation(e.target.value)} 
                    className="p-1 border rounded-lg text-sm"
                >
                    <option value="All">All Sites</option>
                    {SITE_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </div>

            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {['name', 'type', 'zone', 'location', 'owner', 'impact'].map(key => (
                                <th 
                                    key={key} 
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-indigo-600"
                                    onClick={() => toggleSort(key)}
                                >
                                    <div className="flex items-center space-x-1">
                                        <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                                        {renderSortIcon(key)}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredAndSortedAssets.map(asset => (
                            <tr key={asset.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{asset.name}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.type}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{asset.zone}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-indigo-600 font-medium flex items-center"><MapPin className="w-3 h-3 mr-1" />{asset.location}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 flex items-center"><Users className="w-3 h-3 mr-1" />{asset.owner}</td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-500">{asset.impact}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    );
  };

  const ControlStatusToggle = ({ assetId, framework, frId, control }) => {
    const [status, setStatus] = useState(control.status || 'Not Assessed');
    const [notes, setNotes] = useState(control.notes || '');

    useEffect(() => {
        setStatus(control.status || 'Not Assessed');
        setNotes(control.notes || '');
    }, [control.status, control.notes]);

    const statusColors = {
        'Implemented': 'bg-green-100 text-green-800 border-green-300',
        'Partially Implemented': 'bg-yellow-100 text-yellow-800 border-yellow-300',
        'Not Implemented': 'bg-red-100 text-red-800 border-red-300',
        'Not Applicable': 'bg-gray-100 text-gray-600 border-gray-300',
        'Not Assessed': 'bg-blue-100 text-blue-800 border-blue-300',
    };

    const handleUpdate = () => {
        updateAssetControl(assetId, framework, frId, control.cid || control.id, status, notes);
    };
    
    const handleCreateTask = () => {
        const assetName = assets.find(a => a.id === assetId)?.name;
        addTask({
            assetName: assetName,
            description: `Remediate control gap for ${control.cid || control.name} on ${assetName} (${framework})`,
            control: control.cid || control.name,
            priority: status === 'Not Implemented' ? 'Critical' : 'High',
        });
    };

    const canWrite = checkWriteAccess();

    return (
        <div className="p-4 border-b hover:bg-gray-50 transition duration-100">
            <div className="flex justify-between items-start">
                <div className="flex-grow pr-4">
                    <p className="font-semibold text-gray-800">{control.cid ? `${control.cid}: ${control.requirement}` : control.name}</p>
                    {control.description && <p className="text-xs text-gray-500 italic mt-1">{control.description}</p>}
                </div>
                <div className="flex-shrink-0 min-w-[120px] text-right">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusColors[status]}`}>
                        {status}
                    </span>
                </div>
            </div>

            {canWrite && (
                <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 space-y-2">
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                        <select 
                            value={status} 
                            onChange={(e) => setStatus(e.target.value)} 
                            className="flex-grow p-1 border rounded text-sm"
                            disabled={!canWrite}
                        >
                            {Object.keys(statusColors).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <button onClick={handleUpdate} className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition font-medium flex-shrink-0" disabled={!canWrite}>Apply Status</button>
                    </div>
                    <textarea 
                        placeholder="Add assessment notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full p-2 border rounded text-xs resize-none"
                        rows="2"
                        onBlur={handleUpdate} // Auto-save notes on blur
                        disabled={!canWrite}
                    />
                    {(status === 'Not Implemented' || status === 'Partially Implemented') && (
                        <button onClick={handleCreateTask} className="w-full py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 flex items-center justify-center space-x-1 font-medium" disabled={!canWrite}>
                            <HardHat className="w-3 h-3" /> <span>Create Remediation Task</span>
                        </button>
                    )}
                </div>
            )}
            {!canWrite && (
                 <p className="mt-3 text-xs text-center text-gray-500 italic">Sign in as Engineer or Admin to modify controls and notes.</p>
            )}
        </div>
    );
  };

  const SecurityControls = () => {
    const [selectedAssetId, setSelectedAssetId] = useState('');
    const [controlFramework] = useState('IEC');
    
    useEffect(() => {
        if (assets.length > 0 && !selectedAssetId) {
            setSelectedAssetId(assets[0].id);
        }
    }, [assets, selectedAssetId]);

    const selectedAsset = assets.find(a => a.id === selectedAssetId);

    const getControlsToDisplay = useCallback(() => {
        if (!selectedAsset) return [];
        // Only displaying IEC for this final version
        return selectedAsset.controls || IEC_FR_CONTROLS;
    }, [selectedAsset, controlFramework]);

    const controlsToDisplay = getControlsToDisplay();

    return (
      <div className="p-4 sm:p-8 space-y-8">
        <h2 className="text-3xl font-bold text-gray-800 border-b pb-2 flex items-center space-x-2"><CheckCircle className="w-6 h-6" /> Security Controls & Gap Assessment</h2>
        
        <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 bg-white p-4 rounded-xl shadow-lg border">
            <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="p-3 border rounded-lg flex-grow min-w-[200px] text-gray-700"
            >
                <option value="">--- Select Asset for Assessment ---</option>
                {assets.map(asset => (
                    <option key={asset.id} value={asset.id}>
                        {asset.name} ({asset.location})
                    </option>
                ))}
            </select>
            {/* Framework buttons simplified to just display the selected framework */}
            <div className="flex space-x-2 flex-wrap justify-end">
                <button className='px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white'>
                    IEC 62443 FRs
                </button>
            </div>
        </div>

        {!selectedAsset ? (
            <div className="p-8 text-center text-gray-500 bg-white rounded-xl shadow-lg">Please select an asset to begin control assessment.</div>
        ) : (
            <div className="bg-white rounded-xl shadow-lg border">
                <div className="p-4 bg-gray-50 border-b">
                    <h3 className="text-xl font-bold text-gray-800">Assessing {selectedAsset.name} against IEC 62443 FRs</h3>
                    <p className="text-sm text-gray-500">Owner: {selectedAsset.owner} | Location: {selectedAsset.location}</p>
                </div>
                
                <div className="divide-y divide-gray-200">
                    {controlsToDisplay.map(fr => (
                        <div key={fr.id} className="p-4">
                            <h4 className="font-extrabold text-indigo-700 mb-2 border-b pb-1">{fr.fr}: {fr.name}</h4>
                            {fr.controls.map(control => (
                                <ControlStatusToggle
                                    key={control.cid}
                                    assetId={selectedAssetId}
                                    framework="IEC"
                                    frId={fr.id}
                                    control={control}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        )}
        {errorMessage && (
            <p className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-lg">
                {errorMessage}
            </p>
        )}
      </div>
    );
  };

  const RemediationTasks = () => {
    const statusColors = {
        'Open': 'bg-red-500',
        'In Progress': 'bg-yellow-500',
        'Complete': 'bg-green-500',
    };
    
    const canWrite = checkWriteAccess();

    return (
      <div className="p-4 sm:p-8 space-y-8">
        <h2 className="text-3xl font-bold text-gray-800 border-b pb-2 flex items-center space-x-2"><HardHat className="w-6 h-6" /> Remediation Tasks Management</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            <Card title="Total Open Tasks" value={tasks.filter(t => t.status === 'Open').length} icon={<AlertTriangle />} />
            <Card title="In Progress Tasks" value={tasks.filter(t => t.status === 'In Progress').length} icon={<Clock />} />
            <Card title="Completed Tasks" value={tasks.filter(t => t.status === 'Complete').length} icon={<CheckCircle />} />
        </div>

        <div className="bg-white rounded-xl shadow-lg border">
            <div className="p-4 bg-gray-50 border-b">
                <h3 className="text-xl font-bold text-gray-800">Task List ({tasks.length})</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tasks.map(task => (
                            <tr key={task.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-red-600">{task.priority}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{task.description}</td>
                                <td className="px-4 py-3 text-sm text-indigo-600 font-medium">{task.assetName}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full text-white ${statusColors[task.status]}`}>{task.status}</span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm">
                                    <select 
                                        value={task.status} 
                                        onChange={(e) => updateTaskStatus(task.id, e.target.value)} 
                                        className="p-1 border rounded text-xs"
                                        disabled={!canWrite}
                                    >
                                        <option value="Open">Open</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Complete">Complete</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!canWrite && (
                 <p className="p-4 text-xs text-center text-gray-500 italic border-t">Sign in as Engineer or Admin to modify task status.</p>
            )}
        </div>
        {errorMessage && (
            <p className="p-3 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-lg">
                {errorMessage}
            </p>
        )}
      </div>
    );
  };

  const AdminDashboard = () => {
    if (!checkAdminAccess()) {
        return (
             <div className="p-8 text-center text-xl text-red-800 bg-red-100 min-h-[400px] flex items-center justify-center rounded-xl border border-red-300 m-8">
                ACCESS DENIED: You must have the **Admin** role to view this dashboard. Your current role is **{userRole}**.
            </div>
        );
    }
    
    return (
      <div className="p-4 sm:p-8 space-y-8">
        <h2 className="text-3xl font-bold text-gray-800 border-b pb-2 flex items-center space-x-2"><User className="w-6 h-6" /> Admin Dashboard: User Management</h2>
        <div className="bg-white p-6 rounded-xl shadow-lg border">
          <h3 className="text-xl font-semibold mb-4">Simulated Registered Users ({registeredUsers.length})</h3>
          <p className="text-sm text-gray-500 mb-4 font-mono">
            Firestore App ID: **{appId}**
          </p>
          <p className="text-sm text-gray-500 mb-4 font-mono">
            Public Data Path: /artifacts/{appId}/public/data/...
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">UID</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {registeredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{u.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        u.role === 'admin' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {u.role?.toUpperCase() || 'ENGINEER'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500">{u.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );


  const renderContent = () => {
    if (loading || !isAuthReady) {
        return (
             <div className="flex items-center justify-center min-h-[600px] bg-gray-50">
                <div className="text-xl font-semibold text-indigo-600">
                  <div className="animate-spin inline-block w-6 h-6 border-[3px] border-current border-t-transparent text-indigo-600 rounded-full mr-3" role="status">
                    <span className="sr-only">Loading...</span>
                  </div>
                  Authenticating and Loading Data for OT Guardian...
                </div>
              </div>
        );
    }
    
    switch (currentView) {
      case 'riskDashboard': return <RiskDashboard />;
      case 'assetBuilder': return <AssetBuilder />;
      case 'securityControls': return <SecurityControls />;
      case 'remediationTasks': return <RemediationTasks />;
      case 'admin': return <AdminDashboard />;
      default: return <RiskDashboard />;
    }
  };


  // Main Authenticated View
  return (
    <div className="min-h-screen bg-gray-100 p-2 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <header className="p-4 sm:p-5 bg-indigo-700 text-white flex justify-between items-center flex-wrap gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">🛡️ OT Guardian: IEC 62443 Posture Manager</h1>
          <div className="flex items-center space-x-4">
            <div className='flex flex-col text-right'>
                <span className="text-sm font-medium">{user?.email || 'Guest'}</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full self-end ${
                    userRole === 'admin' ? 'bg-yellow-300 text-gray-900' : userRole === 'Guest' ? 'bg-gray-400 text-white' : 'bg-indigo-400 text-white'
                }`}>
                    Role: {userRole.toUpperCase()}
                </span>
            </div>
            {user && (
                 <button onClick={handleSignOut} className="p-2 bg-indigo-800 rounded-full hover:bg-red-600 transition shadow-lg">
                    <LogOut className='w-5 h-5' />
                 </button>
            )}
          </div>
        </header>

        {/* Navigation Bar */}
        <nav className="flex space-x-1 p-3 border-b bg-gray-50 overflow-x-auto whitespace-nowrap">
          {[
            { view: 'riskDashboard', label: 'Risk Dashboard', icon: <Shield className="w-4 h-4 mr-2" /> },
            { view: 'assetBuilder', label: 'Asset Builder', icon: <Cpu className="w-4 h-4 mr-2" /> },
            { view: 'securityControls', label: 'Controls', icon: <CheckCircle className="w-4 h-4 mr-2" /> },
            { view: 'remediationTasks', label: 'Remediation', icon: <HardHat className="w-4 h-4 mr-2" /> },
            ...(checkAdminAccess() ? [{ view: 'admin', label: 'Admin', icon: <User className="w-4 h-4 mr-2" /> }] : []),
          ].map(item => (
            <button
              key={item.view}
              onClick={() => setCurrentView(item.view)}
              className={`flex items-center px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-150 ${
                currentView === item.view ? 'bg-indigo-700 text-white shadow-md' : 'text-gray-700 hover:bg-indigo-100'
              }`}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <div className="p-0">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default App;