import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, serverTimestamp, setLogLevel } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signOut } from 'firebase/auth'; // Removed signInWithCustomToken
import { X, CheckCircle, AlertTriangle, Cpu, HardHat, BarChart2, Shield, Settings, User, BookOpen, Clock, Zap, Target, MapPin, Users, Filter, ArrowDownUp, LogOut } from 'lucide-react';

// --- CONFIGURATION AND FIREBASE INITIALIZATION ---

// Hardcoded configuration (from your provided details)
const firebaseConfig = {
    apiKey: "AIzaSyAyDKqA-j9yjp4KeGPGR49Cr6_q_drxBVs",
    authDomain: "otgaurdian.firebaseapp.com",
    projectId: "otgaurdian",
    storageBucket: "otgaurdian.firebasestorage.app",
    messagingSenderId: "719542806938",
    appId: "1:719542806938:web:ed9376fcc7d04851e47223",
    measurementId: "G-9FMPGC5C93"
};

const appId = firebaseConfig.appId;

// Set up Firebase services immediately
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Enable logging for debugging
setLogLevel('debug');

// --- ROLE MANAGEMENT ---

// Mapping the user UIDs you provided to roles.
const USER_ROLES_MAP = {
    // CYBERMELB@GMAIL.COM (Admin)
    'ZP6wE0ha6FWY9G4wJGXaVhRHioj2': 'admin',
    // faysalhasan2001@yahoo.com (Engineer)
    'JzUrZlEonaPM59hJEEM3waNzNOk2': 'engineer',
};

const getRoleByUid = (uid) => USER_ROLES_MAP[uid] || 'guest';

// --- INITIAL DATA STRUCTURES ---

// Base path for public, collaborative data
const PUBLIC_DATA_PATH = `artifacts/${appId}/public/data`;

// Initial asset structure for the Asset Builder
const initialAsset = {
    name: 'New Asset',
    type: 'PLC', // Programmable Logic Controller
    location: 'Production Line A',
    criticality: 'High',
    last_review: serverTimestamp(),
    owner: '',
    riskScore: 0,
    controls: [], // References to applied controls
};

// --- UTILITIES ---

const calculateRiskScore = (controls) => {
    if (!controls || controls.length === 0) return 100;
   
    // Simple score reduction: each implemented control reduces risk by 10 points
    const implementedControls = controls.filter(c => c.status === 'Implemented').length;
    let score = 100 - (implementedControls * 10);
   
    // Ensure score doesn't go below zero
    return Math.max(0, score);
};

// --- REACT COMPONENTS (omitted for brevity, assume they are the same as previous) ---

// Generic Modal Component (Replaces alert/confirm)
const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:w-full">
                <div className="px-4 py-4 sm:px-6">
                    <h3 className="text-lg leading-6 font-bold text-gray-900 border-b pb-2">
                        {title}
                    </h3>
                    <div className="mt-4 text-sm text-gray-500">
                        {children}
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="button"
                            className="inline-flex justify-center w-full rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Component for Risk Dashboard
const RiskDashboard = ({ assets, controls, userId, userRole }) => {
    const [selectedAsset, setSelectedAsset] = useState(null);

    const assetData = assets.map(asset => ({
        ...asset,
        riskScore: calculateRiskScore(asset.controls)
    })).sort((a, b) => b.riskScore - a.riskScore); // Sort by highest risk

    const ControlBadge = ({ status }) => {
        let colorClass = 'bg-gray-200 text-gray-800';
        if (status === 'Implemented') colorClass = 'bg-green-100 text-green-800';
        if (status === 'Planned') colorClass = 'bg-yellow-100 text-yellow-800';
        if (status === 'Incomplete') colorClass = 'bg-red-100 text-red-800';

        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="p-4 md:p-6 bg-white rounded-xl shadow-lg m-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Shield className="w-6 h-6 mr-2 text-red-600" /> Operational Technology Risk Dashboard</h2>

            {/* Risk Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-red-50 p-6 rounded-lg shadow-md border-l-4 border-red-500">
                    <p className="text-sm font-medium text-gray-500">High Risk Assets</p>
                    <p className="text-3xl font-extrabold text-red-700">{assetData.filter(a => a.riskScore >= 70).length}</p>
                </div>
                <div className="bg-yellow-50 p-6 rounded-lg shadow-md border-l-4 border-yellow-500">
                    <p className="text-sm font-medium text-gray-500">Avg. Risk Score</p>
                    <p className="text-3xl font-extrabold text-yellow-700">
                        {assetData.length > 0 ? (assetData.reduce((sum, a) => sum + a.riskScore, 0) / assetData.length).toFixed(0) : 0}%
                    </p>
                </div>
                <div className="bg-green-50 p-6 rounded-lg shadow-md border-l-4 border-green-500">
                    <p className="text-sm font-medium text-gray-500">Implemented Controls</p>
                    <p className="text-3xl font-extrabold text-green-700">{controls.filter(c => c.status === 'Implemented').length}</p>
                </div>
            </div>

            {/* Asset Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 shadow-md rounded-lg">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Asset Name / Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Criticality</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risk Score</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {assetData.map((asset) => (
                            <tr key={asset.id} className="hover:bg-indigo-50 transition duration-150">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <Cpu className="inline w-4 h-4 mr-2 text-indigo-500" />{asset.name}
                                    <span className="block text-xs text-gray-500">({asset.type})</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{asset.location}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${asset.criticality === 'High' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                        {asset.criticality}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold">
                                    <div className="w-24 bg-gray-200 rounded-full h-2.5">
                                        <div
                                            className={`h-2.5 rounded-full ${asset.riskScore > 60 ? 'bg-red-600' : asset.riskScore > 30 ? 'bg-yellow-500' : 'bg-green-600'}`}
                                            style={{ width: `${asset.riskScore}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs text-gray-500 mt-1 block">{asset.riskScore}%</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => setSelectedAsset(asset)}
                                        className="text-indigo-600 hover:text-indigo-900 font-semibold"
                                    >
                                        View Details
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {assetData.length === 0 && (
                            <tr><td colSpan="5" className="text-center py-6 text-gray-500">No assets defined yet. Go to Asset Builder.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Asset Detail Modal */}
            <Modal isOpen={selectedAsset !== null} onClose={() => setSelectedAsset(null)} title={`Asset Details: ${selectedAsset?.name}`}>
                {selectedAsset && (
                    <div>
                        <p><strong>Type:</strong> {selectedAsset.type}</p>
                        <p><strong>Location:</strong> {selectedAsset.location}</p>
                        <p><strong>Criticality:</strong> <span className={`font-bold ${selectedAsset.criticality === 'High' ? 'text-red-600' : 'text-green-600'}`}>{selectedAsset.criticality}</span></p>
                        <p><strong>Current Risk Score:</strong> <span className="font-extrabold text-lg text-indigo-600">{selectedAsset.riskScore}%</span></p>
                       
                        <h4 className="font-semibold mt-4 mb-2 text-gray-700 border-t pt-2">Applied Controls ({selectedAsset.controls.length})</h4>
                        <ul className="space-y-2 max-h-48 overflow-y-auto pr-2">
                            {selectedAsset.controls.map((control, index) => (
                                <li key={index} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded-lg">
                                    <span className="font-medium text-gray-900">{control.name}</span>
                                    <ControlBadge status={control.status} />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </Modal>
        </div>
    );
};

// Component for Asset Builder
const AssetBuilder = ({ assets, setAssets, userId, userRole }) => {
    const isAllowed = userRole === 'admin' || userRole === 'engineer';
    const [newAsset, setNewAsset] = useState(initialAsset);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');

    const handleAddAsset = async () => {
        if (!isAllowed) {
            setModalContent("You must be an Admin or Engineer to add assets.");
            setIsModalOpen(true);
            return;
        }
        if (!newAsset.name || !newAsset.owner) {
            setModalContent("Asset Name and Owner are required.");
            setIsModalOpen(true);
            return;
        }
       
        try {
            const assetRef = doc(collection(db, PUBLIC_DATA_PATH, 'assets'));
            await setDoc(assetRef, {
                ...newAsset,
                id: assetRef.id,
                created_by: userId,
                timestamp: serverTimestamp(),
                controls: []
            });
            setNewAsset(initialAsset);
            setModalContent(`Asset "${newAsset.name}" added successfully.`);
        } catch (error) {
            console.error("Error adding asset: ", error);
            setModalContent("Failed to add asset. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }
    };

    return (
        <div className="p-4 md:p-6 bg-white rounded-xl shadow-lg m-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Cpu className="w-6 h-6 mr-2 text-indigo-600" /> OT Asset Management</h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Add New Asset Form */}
                <div className="lg:col-span-1 bg-indigo-50 p-6 rounded-lg shadow-inner">
                    <h3 className="text-xl font-semibold mb-4 text-indigo-800 border-b border-indigo-200 pb-2">Create New Asset</h3>
                    <div className="space-y-4">
                        <input
                            type="text"
                            placeholder="Asset Name (e.g., Boiler 1 Controller)"
                            value={newAsset.name}
                            onChange={(e) => setNewAsset({...newAsset, name: e.target.value})}
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <select
                            value={newAsset.type}
                            onChange={(e) => setNewAsset({...newAsset, type: e.target.value})}
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="PLC">PLC (Controller)</option>
                            <option value="HMI">HMI (Interface)</option>
                            <option value="Historian">Historian (Data)</option>
                            <option value="Network">Network Switch</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Location (e.g., Plant Floor 3)"
                            value={newAsset.location}
                            onChange={(e) => setNewAsset({...newAsset, location: e.target.value})}
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <input
                            type="text"
                            placeholder="Owner (Required)"
                            value={newAsset.owner}
                            onChange={(e) => setNewAsset({...newAsset, owner: e.target.value})}
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <select
                            value={newAsset.criticality}
                            onChange={(e) => setNewAsset({...newAsset, criticality: e.target.value})}
                            className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="High">High Criticality</option>
                            <option value="Medium">Medium Criticality</option>
                            <option value="Low">Low Criticality</option>
                        </select>

                        <button
                            onClick={handleAddAsset}
                            disabled={!isAllowed}
                            className={`w-full p-3 rounded-lg text-white font-bold transition-all ${isAllowed ? 'bg-indigo-600 hover:bg-indigo-700 shadow-md' : 'bg-gray-400 cursor-not-allowed'}`}
                        >
                            <Zap className="inline w-4 h-4 mr-2" /> {isAllowed ? 'Add Asset' : 'View Only'}
                        </button>
                        {!isAllowed && <p className="text-red-600 text-center text-sm mt-2">Sign in as Engineer or Admin to add.</p>}
                    </div>
                </div>

                {/* 2. Existing Assets List */}
                <div className="lg:col-span-2">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Existing Assets ({assets.length})</h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {assets.map(asset => (
                            <div key={asset.id} className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 flex justify-between items-center hover:shadow-md transition duration-200">
                                <div>
                                    <p className="font-semibold text-gray-900 flex items-center"><MapPin className="w-4 h-4 mr-2 text-indigo-500" />{asset.name} - ({asset.type})</p>
                                    <p className="text-sm text-gray-500 ml-6">Owner: {asset.owner} | Criticality: {asset.criticality}</p>
                                </div>
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${asset.criticality === 'High' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                    {asset.criticality}
                                </span>
                            </div>
                        ))}
                         {assets.length === 0 && <p className="text-center text-gray-500 py-10">No assets have been created yet.</p>}
                    </div>
                </div>
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Asset Builder Status">
                <p>{modalContent}</p>
            </Modal>
        </div>
    );
};

// Component for Security Controls
const SecurityControls = ({ assets, controls, setAssets, setControls, userId, userRole }) => {
    const isAllowed = userRole === 'admin' || userRole === 'engineer';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');

    const handleUpdateControl = useCallback(async (controlId, assetId, newStatus) => {
        if (!isAllowed) {
            setModalContent("Only Admins or Engineers can update control status.");
            setIsModalOpen(true);
            return;
        }

        try {
            // 1. Update the main control status (if globally applied) - we update all instances for simplicity
            const controlToUpdate = controls.find(c => c.id === controlId);
            if (controlToUpdate) {
                const controlRef = doc(db, PUBLIC_DATA_PATH, 'controls', controlId);
                // Note: We are no longer updating the global control status, as it should remain 'Unspecified'
                // and the status is tracked per asset.

                // await updateDoc(controlRef, { status: newStatus });
                // ^ Removed this line to prevent confusion over global vs asset status
            }

            // 2. Update the control status within the specific asset
            const assetToUpdate = assets.find(a => a.id === assetId);
            if (assetToUpdate) {
                const assetControls = assetToUpdate.controls.map(c =>
                    c.id === controlId ? { ...c, status: newStatus } : c
                );
               
                const assetRef = doc(db, PUBLIC_DATA_PATH, 'assets', assetId);
                await updateDoc(assetRef, {
                    controls: assetControls,
                    last_review: serverTimestamp()
                });
            }

            setModalContent(`Control status for ${controlToUpdate?.name || 'Asset'} updated to "${newStatus}".`);
        } catch (error) {
            console.error("Error updating control: ", error);
            setModalContent("Failed to update control. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }
    }, [isAllowed, assets, controls]);

    const handleApplyControlToAsset = useCallback(async (assetId, control) => {
        if (!isAllowed) {
            setModalContent("Only Admins or Engineers can apply new controls.");
            setIsModalOpen(true);
            return;
        }
       
        const assetToUpdate = assets.find(a => a.id === assetId);
        if (!assetToUpdate) return;
       
        // Prevent duplicates
        if (assetToUpdate.controls.some(c => c.id === control.id)) {
            setModalContent(`Control "${control.name}" is already applied to this asset.`);
            setIsModalOpen(true);
            return;
        }

        try {
            const assetRef = doc(db, PUBLIC_DATA_PATH, 'assets', assetId);
            const newControlEntry = {
                id: control.id,
                name: control.name,
                status: 'Incomplete', // New controls start as incomplete
                timestamp: serverTimestamp()
            };

            await updateDoc(assetRef, {
                controls: [...assetToUpdate.controls, newControlEntry],
                last_review: serverTimestamp()
            });

            setModalContent(`Control "${control.name}" applied to asset "${assetToUpdate.name}". Status set to Incomplete.`);
        } catch (error) {
            console.error("Error applying control to asset: ", error);
            setModalContent("Failed to apply control to asset. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }

    }, [isAllowed, assets, controls]);

    const ControlCard = ({ control }) => (
        <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-indigo-400">
            <h4 className="font-bold text-gray-800 flex items-center"><CheckCircle className="w-5 h-5 mr-2 text-green-500" />{control.name}</h4>
            <p className="text-sm text-gray-600 mt-1 mb-3">{control.description}</p>
           
            <div className="mt-3 space-y-3">
                <p className="font-medium text-sm text-indigo-700">Apply to Assets:</p>
                {assets.map(asset => (
                    <div key={asset.id} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded-lg">
                        <span>{asset.name}</span>
                        <button
                            onClick={() => handleApplyControlToAsset(asset.id, control)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold disabled:text-gray-400"
                            disabled={!isAllowed || asset.controls.some(c => c.id === control.id)}
                        >
                            {asset.controls.some(c => c.id === control.id) ? 'Applied' : 'Apply'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    const AssetControlTable = ({ asset }) => (
        <div className="mt-6 bg-white p-4 rounded-xl shadow-lg border border-gray-200">
            <h4 className="text-lg font-bold text-gray-800 mb-4">{asset.name}'s Controls ({asset.controls.length})</h4>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Control</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Update Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {asset.controls.map(control => (
                            <tr key={control.id}>
                                <td className="px-4 py-2 font-medium">{control.name}</td>
                                <td className="px-4 py-2">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${control.status === 'Implemented' ? 'bg-green-100 text-green-800' : control.status === 'Planned' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                        {control.status}
                                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    <select
                                        value={control.status}
                                        onChange={(e) => handleUpdateControl(control.id, asset.id, e.target.value)}
                                        disabled={!isAllowed}
                                        className={`p-1 border rounded-md text-xs ${!isAllowed ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                                    >
                                        <option value="Incomplete">Incomplete</option>
                                        <option value="Planned">Planned</option>
                                        <option value="Implemented">Implemented</option>
                                    </select>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );


    return (
        <div className="p-4 md:p-6 bg-white rounded-xl shadow-lg m-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Settings className="w-6 h-6 mr-2 text-green-600" /> Security Controls Management</h2>
           
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Global Controls List */}
                <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Available Controls ({controls.length})</h3>
                    {controls.map(control => (
                        <ControlCard key={control.id} control={control} />
                    ))}
                    {controls.length === 0 && <p className="text-center text-gray-500 py-10">No global controls defined yet. Use the Admin page to add.</p>}
                </div>

                {/* Asset-Specific Controls */}
                <div className="lg:col-span-2 space-y-6">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Asset Control Status</h3>
                    {assets.map(asset => (
                        <AssetControlTable key={asset.id} asset={asset} />
                    ))}
                    {assets.length === 0 && <p className="text-center text-gray-500 py-10">No assets to manage. Go to Asset Builder first.</p>}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Control Status">
                <p>{modalContent}</p>
            </Modal>
        </div>
    );
};

// Component for Remediation Tasks
const RemediationTasks = ({ assets, controls, setAssets, setControls, userId, userRole }) => {
    const isAllowed = userRole === 'admin' || userRole === 'engineer';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');
   
    // Simple logic: a task exists for every 'Incomplete' or 'Planned' control on an asset
    const tasks = useMemo(() => {
        return assets.flatMap(asset =>
            asset.controls
                .filter(c => c.status !== 'Implemented')
                .map(control => ({
                    id: `${asset.id}-${control.id}`,
                    assetName: asset.name,
                    controlName: control.name,
                    status: control.status === 'Incomplete' ? 'To Do' : 'In Progress',
                    priority: asset.criticality === 'High' ? 'High' : 'Medium',
                    assetId: asset.id,
                    controlId: control.id,
                }))
        );
    }, [assets]);

    const handleUpdateTaskStatus = useCallback(async (task, newStatus) => {
        if (!isAllowed) {
            setModalContent("Only Admins or Engineers can update task status.");
            setIsModalOpen(true);
            return;
        }

        const newControlStatus = newStatus === 'Complete' ? 'Implemented' : newStatus === 'In Progress' ? 'Planned' : 'Incomplete';

        try {
            // 1. Update the control status within the specific asset
            const assetToUpdate = assets.find(a => a.id === task.assetId);
            if (assetToUpdate) {
                const assetControls = assetToUpdate.controls.map(c =>
                    c.id === task.controlId ? { ...c, status: newControlStatus } : c
                );
               
                const assetRef = doc(db, PUBLIC_DATA_PATH, 'assets', task.assetId);
                await updateDoc(assetRef, {
                    controls: assetControls,
                    last_review: serverTimestamp()
                });
            }

            setModalContent(`Task for control "${task.controlName}" on asset "${task.assetName}" updated to "${newStatus}".`);
        } catch (error) {
            console.error("Error updating task: ", error);
            setModalContent("Failed to update task. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }
    }, [isAllowed, assets]);

    const TaskCard = ({ task }) => {
        let statusClass = 'bg-red-100 text-red-800';
        if (task.status === 'In Progress') statusClass = 'bg-yellow-100 text-yellow-800';
        if (task.status === 'Complete') statusClass = 'bg-green-100 text-green-800';
       
        let priorityClass = task.priority === 'High' ? 'text-red-500' : 'text-yellow-500';

        return (
            <div className="bg-white p-5 rounded-xl shadow-md border-l-4 border-red-400">
                <div className="flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-gray-800 flex items-center"><HardHat className="w-5 h-5 mr-2 text-indigo-500" /> Remediation for: {task.controlName}</h4>
                        <p className="text-sm text-gray-600 mt-1">Asset: {task.assetName} (Priority: <span className={`font-semibold ${priorityClass}`}>{task.priority}</span>)</p>
                    </div>
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>
                        {task.status}
                    </span>
                </div>
               
                <div className="mt-4 flex justify-between items-center border-t pt-3">
                    <p className="text-sm font-medium text-gray-500">Update Status:</p>
                    <select
                        value={task.status === 'Implemented' ? 'Complete' : task.status === 'Planned' ? 'In Progress' : 'To Do'}
                        onChange={(e) => handleUpdateTaskStatus(task, e.target.value)}
                        disabled={!isAllowed}
                        className={`p-1 border rounded-md text-sm ${!isAllowed ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    >
                        <option value="To Do">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Complete">Complete</option>
                    </select>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 bg-white rounded-xl shadow-lg m-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><Clock className="w-6 h-6 mr-2 text-red-600" /> Remediation Task List</h2>
           
            <p className="text-sm text-gray-600 mb-6">Tasks are automatically generated for any asset controls that are *Incomplete* or *Planned*.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tasks.map(task => (
                    <TaskCard key={task.id} task={task} />
                ))}
                {tasks.length === 0 && <p className="col-span-3 text-center text-gray-500 py-10">All assigned controls are implemented. No remediation tasks pending!</p>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Task Status Update">
                <p>{modalContent}</p>
            </Modal>
        </div>
    );
};

// Component for Admin Panel
const AdminPanel = ({ userId, userRole, controls, setControls }) => {
    const [newControl, setNewControl] = useState({ name: '', description: '', severity: 'Medium' });
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');

    const handleAddControl = async () => {
        if (userRole !== 'admin') {
            setModalContent("Only Admins can add new global controls.");
            setIsModalOpen(true);
            return;
        }
        if (!newControl.name || !newControl.description) {
            setModalContent("Control Name and Description are required.");
            setIsModalOpen(true);
            return;
        }

        try {
            const controlRef = doc(collection(db, PUBLIC_DATA_PATH, 'controls'));
            await setDoc(controlRef, {
                ...newControl,
                id: controlRef.id,
                status: 'Unspecified', // Global controls start as unspecified status
                created_by: userId,
                timestamp: serverTimestamp(),
            });
            setNewControl({ name: '', description: '', severity: 'Medium' });
            setModalContent(`New control "${newControl.name}" added successfully.`);
        } catch (error) {
            console.error("Error adding control: ", error);
            setModalContent("Failed to add control. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }
    };

    const handleDeleteControl = async (controlId, controlName) => {
        if (userRole !== 'admin') {
            setModalContent("Only Admins can delete controls.");
            setIsModalOpen(true);
            return;
        }

        // NOTE: In a real app, you would also need to remove this control from ALL assets.
        // For this demo, we only delete the global entry for simplicity.
        const confirmation = window.confirm(`Are you sure you want to delete the control: ${controlName}? This action cannot be undone.`);
        if (!confirmation) return;


        try {
            const controlRef = doc(db, PUBLIC_DATA_PATH, 'controls', controlId);
            await deleteDoc(controlRef);
            setModalContent(`Control "${controlName}" deleted successfully.`);
        } catch (error) {
            console.error("Error deleting control: ", error);
            setModalContent("Failed to delete control. Check console for details.");
        } finally {
            setIsModalOpen(true);
        }
    };

    return (
        <div className="p-4 md:p-6 bg-white rounded-xl shadow-lg m-4">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center"><User className="w-6 h-6 mr-2 text-purple-600" /> Admin Panel: Global Controls</h2>

            {userRole === 'admin' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 1. Add New Control Form */}
                    <div className="lg:col-span-1 bg-purple-50 p-6 rounded-xl shadow-inner h-fit">
                        <h3 className="text-xl font-semibold mb-4 text-purple-800 border-b border-purple-200 pb-2">Add New Global Control</h3>
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Control Name (e.g., Network Segmentation)"
                                value={newControl.name}
                                onChange={(e) => setNewControl({...newControl, name: e.target.value})}
                                className="w-full p-3 border border-purple-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                            />
                            <textarea
                                placeholder="Description (e.g., Isolate OT network from IT network.)"
                                value={newControl.description}
                                onChange={(e) => setNewControl({...newControl, description: e.target.value})}
                                className="w-full p-3 border border-purple-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 h-24"
                            />
                            <select
                                value={newControl.severity}
                                onChange={(e) => setNewControl({...newControl, severity: e.target.value})}
                                className="w-full p-3 border border-purple-300 rounded-lg focus:ring-purple-500 focus:border-purple-500"
                            >
                                <option value="High">High Severity</option>
                                <option value="Medium">Medium Severity</option>
                                <option value="Low">Low Severity</option>
                            </select>

                            <button
                                onClick={handleAddControl}
                                className="w-full p-3 rounded-lg text-white font-bold transition-all bg-purple-600 hover:bg-purple-700 shadow-md"
                            >
                                <Target className="inline w-4 h-4 mr-2" /> Add Global Control
                            </button>
                        </div>
                    </div>

                    {/* 2. Existing Controls List */}
                    <div className="lg:col-span-2">
                        <h3 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Existing Global Controls ({controls.length})</h3>
                        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                            {controls.map(control => (
                                <div key={control.id} className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 flex justify-between items-start hover:shadow-md transition duration-200">
                                    <div className='flex-1 pr-4'>
                                        <p className="font-semibold text-gray-900 flex items-center"><BookOpen className="w-4 h-4 mr-2 text-purple-500" />{control.name}</p>
                                        <p className="text-sm text-gray-600 ml-6">{control.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteControl(control.id, control.name)}
                                        className="text-red-600 hover:text-red-800 text-sm font-semibold p-1 rounded-md transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                            {controls.length === 0 && <p className="text-center text-gray-500 py-10">No global controls defined yet.</p>}
                        </div>
                    </div>
                </div>
            ) : (
                <p className="text-lg text-red-600 font-semibold p-8 border-2 border-dashed border-red-300 rounded-xl text-center">
                    <AlertTriangle className="inline w-6 h-6 mr-2" /> ACCESS DENIED: This panel is restricted to the **ADMIN** role only.
                </p>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Admin Action Status">
                <p>{modalContent}</p>
            </Modal>
        </div>
    );
};


// --- MAIN APP COMPONENT ---
export default function App() {
    const [assets, setAssets] = useState([]);
    const [controls, setControls] = useState([]);
    const [user, setUser] = useState(null);
    const [userRole, setUserRole] = useState('guest');
    const [authReady, setAuthReady] = useState(false);
    const [currentView, setCurrentView] = useState('riskDashboard');

    // 1. Authentication and User Role Setup
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // User is signed in
                const role = getRoleByUid(currentUser.uid);
                setUser(currentUser);
                setUserRole(role);
            } else {
                // No user signed in, attempt anonymous sign-in
                try {
                    // CRITICAL FIX: Only attempt anonymous sign-in, removing custom token logic.
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Authentication failed:", error);
                }
            }
            setAuthReady(true);
        });

        // Cleanup listener on component unmount
        return () => unsubscribe();
    }, []);

    // 2. Firestore Data Listeners
    useEffect(() => {
        if (!authReady || !user) return; // Wait for authentication

        // Listener for Assets
        const qAssets = query(collection(db, PUBLIC_DATA_PATH, 'assets'));
        const unsubscribeAssets = onSnapshot(qAssets, (snapshot) => {
            const fetchedAssets = [];
            snapshot.forEach((doc) => {
                fetchedAssets.push({ id: doc.id, ...doc.data() });
            });
            setAssets(fetchedAssets);
        }, (error) => {
            console.error("Firestore Asset Listener failed: ", error);
        });

        // Listener for Global Controls
        const qControls = query(collection(db, PUBLIC_DATA_PATH, 'controls'));
        const unsubscribeControls = onSnapshot(qControls, (snapshot) => {
            const fetchedControls = [];
            snapshot.forEach((doc) => {
                fetchedControls.push({ id: doc.id, ...doc.data() });
            });
            setControls(fetchedControls);
        }, (error) => {
            console.error("Firestore Control Listener failed: ", error);
        });

        // Cleanup function
        return () => {
            unsubscribeAssets();
            unsubscribeControls();
        };

    }, [authReady, user]); // Re-run when auth state is confirmed

    const handleSignOut = useCallback(async () => {
        try {
            await signOut(auth);
            setUser(null);
            setUserRole('guest');
        } catch (error) {
            console.error("Sign out error:", error);
        }
    }, []);
   
    // Check if the current user has admin access
    const checkAdminAccess = () => userRole === 'admin';

    // Conditional rendering based on currentView state
    const renderContent = () => {
        const props = { assets, controls, setAssets, setControls, userId: user?.uid, userRole };

        switch (currentView) {
            case 'riskDashboard':
                return <RiskDashboard {...props} />;
            case 'assetBuilder':
                return <AssetBuilder {...props} />;
            case 'securityControls':
                return <SecurityControls {...props} />;
            case 'remediationTasks':
                return <RemediationTasks {...props} />;
            case 'admin':
                return <AdminPanel {...props} />;
            default:
                return <RiskDashboard {...props} />;
        }
    };
   
    if (!authReady) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100">
                <div className="text-xl font-semibold text-indigo-600 animate-pulse">
                    Loading OT Guardian...
                </div>
            </div>
        );
    }


    return (
        <div className="min-h-screen flex flex-col font-sans">
            {/* Header and User Info */}
            <header className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-10">
                <div className="flex items-center">
                    <Shield className="w-8 h-8 text-indigo-600 mr-3" />
                    <h1 className="text-xl md:text-2xl font-extrabold text-gray-800">OT Guardian <span className='hidden sm:inline'>Demo</span></h1>
                </div>
                <div className="flex items-center space-x-4 text-sm">
                    <div className="text-right">
                        <p className="font-semibold text-gray-700">Role: <span className="text-indigo-600 font-bold uppercase">{userRole}</span></p>
                        <p className="text-xs text-gray-500 truncate max-w-[150px] sm:max-w-none">User ID: {user?.uid || 'Guest'}</p>
                    </div>
                    {user && (
                        <button
                            onClick={handleSignOut}
                            className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors shadow"
                            aria-label="Sign Out"
                        >
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
                        {item.icon} {item.label}
                    </button>
                ))}
            </nav>

            {/* Main Content Area */}
            <main className="flex-grow p-2 md:p-4 bg-gray-100">
                {renderContent()}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 text-white text-xs p-3 text-center">
                OT Guardian Demo | Collaborative Environment | App ID: {appId}
            </footer>
        </div>
    );
}
