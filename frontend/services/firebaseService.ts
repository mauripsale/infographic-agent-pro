// services/firebaseService.ts
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as signOutFirebase,
  GoogleAuthProvider,
  User,
  Auth
} from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';
import { SlidePrompt } from '../types';

// Initialize Firebase safely
let app;
let auth: Auth | null = null;
let initializationError: any = null;

try {
  // Simple check to see if config is dummy
  if (firebaseConfig.apiKey === "YOUR_API_KEY") {
    console.warn("Firebase config is using placeholders. Firebase features will be disabled.");
  } else {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
} catch (error) {
  console.error("Failed to initialize Firebase:", error);
  initializationError = error;
}

let currentAccessToken: string | null = null;

/**
 * Converts a data URL to a File object.
 */
function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)![1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Signs in the user with Google and returns the access token.
 */
export async function signInWithGoogle(): Promise<{ user: User; accessToken: string | null }> {
  if (!auth) throw new Error("Firebase is not initialized. Check your configuration.");
  
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/presentations');
  provider.addScope('https://www.googleapis.com/auth/drive.file');

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken || null;
  currentAccessToken = accessToken;
  return { user: result.user, accessToken };
}

/**
 * Signs out the user.
 */
export function signOut() {
  if (!auth) return Promise.resolve();
  currentAccessToken = null;
  return signOutFirebase(auth);
}

/**
 * Listens for authentication state changes.
 */
export function onAuthStateChangedHelper(callback: (user: User | null) => void) {
  if (!auth) {
    // If not initialized, just call back with null immediately
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

/**
 * Creates a new presentation.
 */
export async function createPresentation(title: string): Promise<any> {
    if (!currentAccessToken) throw new Error("Not signed in");
    const response = await fetch('https://content-slides.googleapis.com/v1/presentations', {
        method: 'POST',
        headers: new Headers({
            'Authorization': 'Bearer ' + currentAccessToken,
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({ title })
    });
    return await response.json();
}

/**
 * Uploads an image to Google Drive.
 */
export async function uploadImageToDrive(
  base64Image: string,
  imageName: string
): Promise<any> {
    if (!currentAccessToken) throw new Error("Not signed in");
  const file = dataURLtoFile(base64Image, imageName);

  const metadata = {
    name: file.name,
    mimeType: file.type,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', file);

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: new Headers({ Authorization: 'Bearer ' + currentAccessToken }),
      body: form,
    }
  );

  return await response.json();
}

/**
 * Makes a file in Google Drive public.
 */
export async function makeFilePublic(fileId: string): Promise<any> {
    if (!currentAccessToken) throw new Error("Not signed in");
    
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: new Headers({
            'Authorization': 'Bearer ' + currentAccessToken,
            'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
            'role': 'reader',
            'type': 'anyone'
        })
    });

    const result = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,webContentLink`, {
        headers: new Headers({
            'Authorization': 'Bearer ' + currentAccessToken,
        })
    });
    return await result.json();
}

/**
 * Adds a slide to the presentation.
 */
export async function addSlide(
  presentationId: string,
  slide: SlidePrompt,
  imageUrl: string
): Promise<any> {
    if (!currentAccessToken) throw new Error("Not signed in");
  const pageId = `slide_${Date.now()}`;
  const requests = [
    {
      createSlide: {
        objectId: pageId,
        insertionIndex: 1,
      },
    },
    {
      updatePageProperties: {
        objectId: pageId,
        pageProperties: {
          pageBackgroundFill: {
            stretchedPictureFill: {
                contentUrl: imageUrl
            }
          }
        }
      }
    },
    {
        insertText: {
            objectId: pageId,
            text: `${slide.title}\n${slide.rawContent}`,
            insertionIndex: 0
        }
    }
  ];

  const body = {
    requests,
  };

  const response = await fetch(`https://content-slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`, {
    method: 'POST',
    headers: new Headers({
        'Authorization': 'Bearer ' + currentAccessToken,
        'Content-Type': 'application/json'
    }),
    body: JSON.stringify(body)
  });
  return await response.json();
}
