namespace HawkAI.Data
{
    public class FixedAugConfig
    {
        public bool Original { get; set; } = true;
        public bool Rotate90 { get; set; } = false;
        public bool Rotate180 { get; set; } = false;
        public bool Rotate270 { get; set; } = false;
        public bool HFlip { get; set; } = false;
        public bool HFlipRotate90 { get; set; } = false;
        public bool HFlipRotate180 { get; set; } = false;
        public bool HFlipRotate270 { get; set; } = false;
    }

    public class RandomRotate { public bool Enabled { get; set; } = true; public int Limit { get; set; } = 15; public double P { get; set; } = 0.3; }
    public class RandomAffineShear { public bool Enabled { get; set; } = true; public double XMin { get; set; } = -1; public double XMax { get; set; } = 1; public double YMin { get; set; } = -1; public double YMax { get; set; } = 1; public double P { get; set; } = 0.3; }
    public class RandomBrightnessContrast { public bool Enabled { get; set; } = true; public double BrightnessMin { get; set; } = 0; public double BrightnessMax { get; set; } = 0.1; public double ContrastMin { get; set; } = 0; public double ContrastMax { get; set; } = 0.1; public double P { get; set; } = 0.3; }
    public class RandomGamma { public bool Enabled { get; set; } = true; public int Min { get; set; } = 70; public int Max { get; set; } = 130; public double P { get; set; } = 0.3; }
    public class RandomRgbShift { public bool Enabled { get; set; } = false; public int RMin { get; set; } = -5; public int RMax { get; set; } = 5; public int GMin { get; set; } = -5; public int GMax { get; set; } = 5; public int BMin { get; set; } = -5; public int BMax { get; set; } = 5; public double P { get; set; } = 0.3; }
    public class RandomGaussianBlur { public bool Enabled { get; set; } = false; public int Min { get; set; } = 2; public int Max { get; set; } = 4; public double P { get; set; } = 0.3; }
    public class RandomShiftScaleRotate { public bool Enabled { get; set; } = false; public double ShiftLimit { get; set; } = 0.30; public double ScaleLimit { get; set; } = 0.0; public int RotateLimit { get; set; } = 15; public int BorderMode { get; set; } = 1; public double P { get; set; } = 0.3; }
    public class RandomHSV { public bool Enabled { get; set; } = false; public int Hue { get; set; } = 15; public int Sat { get; set; } = 25; public int Val { get; set; } = 10; public double P { get; set; } = 0.3; }
    public class RandomGaussNoise { public bool Enabled { get; set; } = false; public double P { get; set; } = 0.3; }


    public class RandomAugConfig
    {
        public RandomRotate Rotate { get; set; } = new();
        public RandomAffineShear Affine_Shear { get; set; } = new();
        public RandomBrightnessContrast Brightness_Contrast { get; set; } = new();
        public RandomGamma Gamma { get; set; } = new();
        public RandomRgbShift Rgb_Shift { get; set; } = new();
        public RandomGaussianBlur Gaussian_Blur { get; set; } = new();
        public RandomShiftScaleRotate Shift_Scale_Rotate { get; set; } = new();
        public RandomHSV Hue_Saturation_Value { get; set; } = new();
        public RandomGaussNoise Gauss_Noise { get; set; } = new();
    }

    public class AugConfigDto
    {
        public double Valid_Ratio { get; set; } = 0.2;
        public int N1 { get; set; } = 1;
        public int N2 { get; set; } = 20;
        public int Seed { get; set; } = 7;
        public FixedAugConfig Fixed { get; set; } = new();
        public RandomAugConfig Random { get; set; } = new();
    }
}
