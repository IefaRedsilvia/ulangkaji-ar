// =====================================================================
// BANK SOALAN: Lecture 6, Activity Lifecycle dan ViewModel
// ---------------------------------------------------------------------
// DRAF untuk disemak oleh pensyarah kursus / SV.
// Peraturan (dari spesifikasi):
//  - Soalan sama pada Hari 0, 1, 7; urutan dikocok setiap pusingan.
//  - Setiap soalan ada 2 versi ayat (versions). Apa yang diuji, bentuk
//    soalan dan modaliti KEKAL. Sistem rekod versi yang dipaparkan.
//  - 5 soalan setiap subtopik: 1 gaze, 2 touch, 1 speech, 1 gesture.
//
// Bentuk (form):
//  gaze     : halakan telefon ke nod pada rajah AR (answer = id nod)
//  order    : susun kad mengikut urutan (answer = urutan id kad)
//  choice   : sentuh satu pilihan (answer = id pilihan)
//  speech   : sebut jawapan (accept = senarai sebutan yang diterima)
//  classify : letak setiap kad dalam kotak yang betul (answer = {kad: kotak})
//             v1: dibuat dengan seret (touch). v2: picit (MediaPipe).
//
// Nod rajah keadaan (istilah set kedua):
//  created, started, resumed, paused, stopped, destroyed
// =====================================================================

export const SUBTOPICS = {
  S1: 'States and callbacks',
  S2: 'Transition scenarios',
  S3: 'ViewModel and architecture',
};

export const STATE_NODES = [
  { id: 'created', label: 'Created' },
  { id: 'started', label: 'Started' },
  { id: 'resumed', label: 'Resumed' },
  { id: 'paused', label: 'Paused' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'destroyed', label: 'Destroyed' },
];

export const ITEMS = [
  // ------------------------------ S1 ------------------------------
  {
    id: 'S1-G', subtopic: 'S1', modality: 'gaze', form: 'gaze',
    versions: [
      'The activity is visible on screen, but the user cannot interact with it yet. Point your phone at this state.',
      'After onStart() finishes and before onResume() is called, which state is the activity in? Point your phone at that state.',
    ],
    answer: 'started',
  },
  {
    id: 'S1-T1', subtopic: 'S1', modality: 'touch', form: 'order',
    versions: [
      'Arrange the callback methods in order, from when the activity is created to when it is destroyed.',
      'Place the cards so the activity lifecycle runs from start to finish.',
    ],
    cards: [
      { id: 'onCreate', label: 'onCreate()' },
      { id: 'onStart', label: 'onStart()' },
      { id: 'onResume', label: 'onResume()' },
      { id: 'onPause', label: 'onPause()' },
      { id: 'onStop', label: 'onStop()' },
      { id: 'onDestroy', label: 'onDestroy()' },
    ],
    answer: ['onCreate', 'onStart', 'onResume', 'onPause', 'onStop', 'onDestroy'],
  },
  {
    id: 'S1-T2', subtopic: 'S1', modality: 'touch', form: 'choice',
    versions: [
      'Which method is called when the activity loses focus but is still partly visible?',
      'The activity can still be seen in the background, but it no longer receives user input. Which method was just called?',
    ],
    options: [
      { id: 'onPause', label: 'onPause()' },
      { id: 'onStop', label: 'onStop()' },
      { id: 'onDestroy', label: 'onDestroy()' },
      { id: 'onRestart', label: 'onRestart()' },
    ],
    answer: 'onPause',
  },
  {
    id: 'S1-S', subtopic: 'S1', modality: 'speech', form: 'speech',
    versions: [
      'Say the name of the method called before onStart() when a stopped activity is opened again.',
      'The activity is in the Stopped state and the user returns to it. Say the first method that is called.',
    ],
    answerLabel: 'onRestart()',
    accept: ['onrestart', 'restart', 'on restart'],
  },
  {
    id: 'S1-X', subtopic: 'S1', modality: 'gesture', form: 'classify',
    versions: [
      'Place each method into the state the activity is in after that method is called.',
      'After each of these methods is called, which state is the activity in? Place each card in the correct box.',
    ],
    cards: [
      { id: 'onResume', label: 'onResume()' },
      { id: 'onPause', label: 'onPause()' },
      { id: 'onStop', label: 'onStop()' },
    ],
    boxes: [
      { id: 'resumed', label: 'Resumed' },
      { id: 'paused', label: 'Paused' },
      { id: 'stopped', label: 'Stopped' },
    ],
    answer: { onResume: 'resumed', onPause: 'paused', onStop: 'stopped' },
  },

  // ------------------------------ S2 ------------------------------
  {
    id: 'S2-G', subtopic: 'S2', modality: 'gaze', form: 'gaze',
    versions: [
      'The user presses the Home button while using the app. Point your phone at the final state of the activity.',
      'The user goes to the phone home screen and the app is no longer visible. Point your phone at the activity state now.',
    ],
    answer: 'stopped',
  },
  {
    id: 'S2-T1', subtopic: 'S2', modality: 'touch', form: 'order',
    versions: [
      'The user returns to the app from the Recents screen. Arrange the methods called, in order.',
      'An app in the background is reopened from Recents. Place the cards in the order the methods are called.',
    ],
    cards: [
      { id: 'onRestart', label: 'onRestart()' },
      { id: 'onStart', label: 'onStart()' },
      { id: 'onResume', label: 'onResume()' },
    ],
    answer: ['onRestart', 'onStart', 'onResume'],
  },
  {
    id: 'S2-T2', subtopic: 'S2', modality: 'touch', form: 'choice',
    versions: [
      'A Share dialog appears and covers part of the app screen. Which method or methods are called?',
      'A small window opens on top of the app, but the app is still visible behind it. What is called?',
    ],
    options: [
      { id: 'pauseOnly', label: 'onPause() only' },
      { id: 'pauseStop', label: 'onPause() and onStop()' },
      { id: 'stopOnly', label: 'onStop() only' },
      { id: 'destroy', label: 'onPause(), onStop() and onDestroy()' },
    ],
    answer: 'pauseOnly',
  },
  {
    id: 'S2-S', subtopic: 'S2', modality: 'speech', form: 'speech',
    versions: [
      'The user presses the Back button and the activity is closed completely. Say the last method that is called.',
      'The activity is finished and removed from memory. Say the last method called before that happens.',
    ],
    answerLabel: 'onDestroy()',
    accept: ['ondestroy', 'destroy', 'on destroy'],
  },
  {
    id: 'S2-X', subtopic: 'S2', modality: 'gesture', form: 'classify',
    versions: [
      'Place each scenario into the final state of the activity.',
      'After each of these user actions, which state is the activity in? Place each card in the correct box.',
    ],
    cards: [
      { id: 'home', label: 'Press Home' },
      { id: 'share', label: 'Share dialog appears' },
      { id: 'back', label: 'Press Back (app closed)' },
    ],
    boxes: [
      { id: 'paused', label: 'Paused' },
      { id: 'stopped', label: 'Stopped' },
      { id: 'destroyed', label: 'Destroyed' },
    ],
    answer: { home: 'stopped', share: 'paused', back: 'destroyed' },
  },

  // ------------------------------ S3 ------------------------------
  {
    id: 'S3-G', subtopic: 'S3', modality: 'gaze', form: 'gaze',
    versions: [
      'When the screen is rotated, the activity is destroyed and recreated. Point your phone at the state it reaches just before it is recreated.',
      'During a configuration change such as screen rotation, the old activity is ended. Point your phone at the state of that old activity.',
    ],
    answer: 'destroyed',
  },
  {
    id: 'S3-T1', subtopic: 'S3', modality: 'touch', form: 'order',
    versions: [
      'Arrange the unidirectional data flow (UDF) when the user taps a dessert in DessertClicker.',
      'Place the cards to show how data flows in UDF, starting with the user action.',
    ],
    cards: [
      { id: 'tap', label: 'User taps a dessert' },
      { id: 'event', label: 'UI sends an event to the ViewModel' },
      { id: 'update', label: 'ViewModel updates the data' },
      { id: 'render', label: 'UI displays the new data' },
    ],
    answer: ['tap', 'event', 'update', 'render'],
  },
  {
    id: 'S3-T2', subtopic: 'S3', modality: 'touch', form: 'choice',
    versions: [
      'DessertClicker uses a ViewModel. Why is the dessert count not lost when the screen is rotated?',
      'After a ViewModel is added, the revenue value stays the same even when the phone is rotated. Why?',
    ],
    options: [
      { id: 'vm', label: 'The ViewModel keeps data across configuration changes' },
      { id: 'noDestroy', label: 'The activity is not destroyed when the screen rotates' },
      { id: 'onPause', label: 'Data is saved automatically in onPause()' },
      { id: 'noRecreate', label: 'The screen is not recreated after rotation' },
    ],
    answer: 'vm',
  },
  {
    id: 'S3-S', subtopic: 'S3', modality: 'speech', form: 'speech',
    versions: [
      'Say the name of the architecture component that keeps UI data even when the activity is recreated.',
      'Which component keeps the app data when the screen is rotated? Say its name.',
    ],
    answerLabel: 'ViewModel',
    accept: ['viewmodel', 'view model', 'viewmodal', 'view modal'],
  },
  {
    id: 'S3-X', subtopic: 'S3', modality: 'gesture', form: 'classify',
    versions: [
      'Place each responsibility into the correct architecture component.',
      'Which component is responsible for each of these tasks? Place each card in the correct box.',
    ],
    cards: [
      { id: 'interact', label: 'Handles user interaction' },
      { id: 'keep', label: 'Keeps data during screen rotation' },
      { id: 'manage', label: 'Manages app data' },
    ],
    boxes: [
      { id: 'ui', label: 'UI layer' },
      { id: 'viewmodel', label: 'ViewModel' },
      { id: 'data', label: 'Data layer' },
    ],
    answer: { interact: 'ui', keep: 'viewmodel', manage: 'data' },
  },
];

// Kandungan latihan antara muka (Hari 0, bukan topik, tidak dianalisis)
export const TRAINING_ITEMS = [
  {
    id: 'T-G', modality: 'gaze', form: 'gaze', training: true,
    versions: ['Practice: point your phone at the Started box and hold until it is selected.'],
    answer: 'started',
  },
  {
    id: 'T-O', modality: 'touch', form: 'order', training: true,
    versions: ['Practice: arrange the numbers from smallest to largest.'],
    cards: [{ id: 'a', label: '1' }, { id: 'b', label: '2' }, { id: 'c', label: '3' }],
    answer: ['a', 'b', 'c'],
  },
  {
    id: 'T-C', modality: 'touch', form: 'choice', training: true,
    versions: ['Practice: tap the colour blue.'],
    options: [{ id: 'r', label: 'Red' }, { id: 'b', label: 'Blue' }, { id: 'h', label: 'Green' }],
    answer: 'b',
  },
  {
    id: 'T-S', modality: 'speech', form: 'speech', training: true,
    versions: ['Practice: press the microphone button and say "one two three".'],
    answerLabel: 'one two three',
    accept: ['one two three', '1 2 3', '123', 'one', 'three', '1 2', '23'],
  },
  {
    id: 'T-X', modality: 'gesture', form: 'classify', training: true,
    versions: ['Practice: place each fruit in the box of its colour.'],
    cards: [{ id: 'pisang', label: 'Banana' }, { id: 'epal', label: 'Red apple' }],
    boxes: [{ id: 'kuning', label: 'Yellow' }, { id: 'merah', label: 'Red' }],
    answer: { pisang: 'kuning', epal: 'merah' },
  },
];
