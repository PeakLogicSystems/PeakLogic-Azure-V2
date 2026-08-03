import type { Partner } from './types';

// WTR DR — residential & commercial pool maintenance and monitoring. Services
// pools at homeowner and commercial properties (HOAs, hotels, fitness clubs).
// Sky/deep blue palette, "wtr dr" lowercase wordmark. Same PeakLogicSystems
// core as Ace, an entirely different vertical: pools, pool chemistry, and pool
// equipment (salt chlorinators, variable-speed pumps, pH/ORP, heaters).
export const WTRDR: Partner = {
  id: 'wtrdr',
  name: 'WTR DR',
  // Branding below is configured by a PeakLogic administrator in Control
  // Center (Channel Partners → the partner's record). It is mirrored here, not
  // invented here — if these disagree with Control Center, Control Center wins.
  logoText: 'WDR',
  lowercaseLogo: false,
  primaryColor: '#0E7490',
  headerColor: '#06333F', // Control Center → Branding → Header colour
  secondaryColor: '#0C4A6E',
  vertical: 'pool',
  terms: {
    siteSingular: 'Pool',
    sitePlural: 'Pools',
    homeGreeting: "Here's how the pools you monitor are looking today.",
    sitesHeading: 'Your pools',
    facilityOpen: 'Open pool layout',
    facilityBuild: 'Draw pool & pump system',
    facilityNoun: 'pool & pump layout',
  },
  technicians: ['D. Ruiz', 'A. Patel', 'S. Kim', 'L. Nguyen'],
  user: { name: 'Dana Brown', role: 'Partner Administrator', email: 'dana.brown@wtrdr.com' },
  sites: [
    {
      id: 'pool-sunsetridge',
      name: 'Sunset Ridge HOA — Community Pool',
      customer: 'Sunset Ridge HOA',
      location: "Land O' Lakes, FL",
      kind: 'commercial',
      health: 'watch',
      alarms: 1,
      hasFacility: true,
      peakview: true,
      devices: [
        { id: 'WTR-2001', name: 'IntelliChlor IC40', type: 'Salt Chlorinator', status: 'online', reading: '60 % output', controllable: true, running: true },
        { id: 'WTR-2002', name: 'IntelliFlo VSF Pump', type: 'Variable-Speed Pump', status: 'online', reading: '2,400 RPM', controllable: true, running: true },
        { id: 'WTR-2003', name: 'pH / ORP Controller', type: 'Chemistry Controller', status: 'online', reading: '7.9 pH · 690 mV', controllable: false },
        { id: 'WTR-2004', name: 'Cartridge Filter', type: 'Filter Pressure', status: 'online', reading: '17 psi', controllable: false },
        { id: 'WTR-2005', name: 'Salt Level', type: 'Salt Sensor', status: 'online', reading: '3,200 ppm', controllable: false },
        { id: 'WTR-2006', name: 'Water Temp', type: 'Temp Sensor', status: 'online', reading: '84 °F', controllable: false },
      ],
    },
    {
      id: 'pool-johnson',
      name: 'The Johnson Residence',
      customer: 'Johnson Residence',
      location: 'Wesley Chapel, FL',
      kind: 'residential',
      health: 'healthy',
      alarms: 0,
      hasFacility: false,
      peakview: true,
      devices: [
        { id: 'WTR-2101', name: 'IntelliChlor IC20', type: 'Salt Chlorinator', status: 'online', reading: '35 % output', controllable: true, running: true },
        { id: 'WTR-2102', name: 'SuperFlo VS Pump', type: 'Variable-Speed Pump', status: 'online', reading: '1,800 RPM', controllable: true, running: true },
        { id: 'WTR-2103', name: 'pH / ORP', type: 'Chemistry Controller', status: 'online', reading: '7.4 pH · 740 mV', controllable: false },
        { id: 'WTR-2104', name: 'Filter', type: 'Filter Pressure', status: 'online', reading: '12 psi', controllable: false },
      ],
    },
    {
      id: 'pool-bayview',
      name: 'Bayview Hotel — Pool & Spa',
      customer: 'Bayview Hotel',
      location: 'Tampa, FL',
      kind: 'commercial',
      health: 'critical',
      alarms: 2,
      hasFacility: false,
      peakview: false,
      devices: [
        { id: 'WTR-2201', name: 'IntelliChlor IC60', type: 'Salt Chlorinator', status: 'fault', reading: '0.8 ppm FC', controllable: true, running: true },
        { id: 'WTR-2202', name: 'Pool Pump', type: 'Variable-Speed Pump', status: 'online', reading: '2,900 RPM', controllable: true, running: true },
        { id: 'WTR-2203', name: 'Spa Pump', type: 'Variable-Speed Pump', status: 'online', reading: 'idle', controllable: true, running: false },
        { id: 'WTR-2204', name: 'MasterTemp Heater', type: 'Heater', status: 'online', reading: '102 °F', controllable: true, running: true },
        { id: 'WTR-2205', name: 'Pool pH / ORP', type: 'Chemistry Controller', status: 'fault', reading: '7.2 pH · 610 mV', controllable: false },
        { id: 'WTR-2206', name: 'Spa pH / ORP', type: 'Chemistry Controller', status: 'online', reading: '7.5 pH · 730 mV', controllable: false },
      ],
    },
    {
      id: 'pool-maplewood',
      name: 'Maplewood Fitness Club — Lap Pool',
      customer: 'Maplewood Fitness',
      location: 'Brandon, FL',
      kind: 'commercial',
      health: 'healthy',
      alarms: 0,
      hasFacility: false,
      peakview: false,
      devices: [
        { id: 'WTR-2301', name: 'IntelliChlor IC60', type: 'Salt Chlorinator', status: 'online', reading: '55 % output', controllable: true, running: true },
        { id: 'WTR-2302', name: 'IntelliFlo Pump', type: 'Variable-Speed Pump', status: 'online', reading: '2,600 RPM', controllable: true, running: true },
        { id: 'WTR-2303', name: 'pH / ORP', type: 'Chemistry Controller', status: 'online', reading: '7.5 pH · 750 mV', controllable: false },
        { id: 'WTR-2304', name: 'Filter', type: 'Filter Pressure', status: 'online', reading: '15 psi', controllable: false },
        { id: 'WTR-2305', name: 'Water Temp', type: 'Temp Sensor', status: 'online', reading: '81 °F', controllable: false },
      ],
    },
    {
      id: 'pool-cedarpoint',
      name: 'Cedar Point Villas — Amenity Pool',
      customer: 'Cedar Point Villas',
      location: 'Dade City, FL',
      kind: 'residential',
      health: 'watch',
      alarms: 0,
      hasFacility: false,
      peakview: false,
      devices: [
        { id: 'WTR-2401', name: 'IntelliChlor IC40', type: 'Salt Chlorinator', status: 'online', reading: '48 % output', controllable: true, running: true },
        { id: 'WTR-2402', name: 'Pool Pump', type: 'Variable-Speed Pump', status: 'fault', reading: 'high temp', controllable: true, running: true },
        { id: 'WTR-2403', name: 'pH / ORP', type: 'Chemistry Controller', status: 'online', reading: '7.6 pH · 700 mV', controllable: false },
      ],
    },
  ],
  tickets: [
    { id: 'SR-8842', title: 'Sunset Ridge — pH 7.9 high, schedule muriatic acid dose', siteId: 'pool-sunsetridge', priority: 'high', status: 'in_progress', technician: 'D. Ruiz', createdDaysAgo: 1, source: 'alarm' },
    { id: 'SR-8840', title: 'Bayview Hotel — free chlorine 0.8 ppm low, inspect IC60 salt cell', siteId: 'pool-bayview', priority: 'critical', status: 'open', createdDaysAgo: 0, source: 'alarm' },
    { id: 'SR-8839', title: 'Bayview Spa — ORP low, calibrate ORP probe', siteId: 'pool-bayview', priority: 'high', status: 'open', createdDaysAgo: 0, source: 'alarm' },
    { id: 'SR-8835', title: 'Johnson Residence — filter 24 psi, backwash needed', siteId: 'pool-johnson', priority: 'normal', status: 'scheduled', technician: 'A. Patel', createdDaysAgo: 2, source: 'alarm' },
    { id: 'SR-8830', title: 'Maplewood — weekly chemistry service', siteId: 'pool-maplewood', priority: 'normal', status: 'open', createdDaysAgo: 1, source: 'pm' },
    { id: 'SR-8824', title: 'Cedar Point — pump running hot, inspect bearings', siteId: 'pool-cedarpoint', priority: 'normal', status: 'scheduled', technician: 'D. Ruiz', createdDaysAgo: 3, source: 'alarm' },
  ],
};
